// Monitor del permiso de un programa: mide cuánto tiempo sigue sirviendo para pagar y por qué deja de hacerlo.
// Cada `intervalo` segundos hace dos sondas con el token guardado:
//   · lectura: lo gastado del permiso (no mueve dinero; puede responder bien aunque ya no pague)
//   · pago mínimo: 1 unidad (0,01 COP) de la billetera del programa a `receptor` (nunca la misma: autopago)
// Al primer pago rechazado por token intenta rotarlo UNA vez (como haría Tatú) y guarda el nuevo si lo consigue.
// No marca el programa como vencido. Escribe una línea JSON por medición y un resumen al final.
//
// Uso: pnpm --filter server exec tsx scripts/monitor-permiso.mts <programaId> <receptor> [intervaloSeg=60] [minutos=30]
import { appendFileSync } from 'node:fs'
import { config, PGLITE_DIR } from '../src/config.ts'
import { crearContenedor } from '../src/contenedor.ts'
import { abrirBase } from '../src/db/conexion.ts'
import { OpenPaymentsService } from '../src/openPaymentsService.ts'

const [idArg, receptorArg, intervaloTxt = '60', minutosTxt = '30'] = process.argv.slice(2)
if (!idArg || !receptorArg) throw new Error('Uso: <programaId> <receptor> [intervaloSeg] [minutos]')
const programaId: string = idArg
const receptor: string = receptorArg
const intervaloMs = Number(intervaloTxt) * 1000
const finEn = Date.now() + Number(minutosTxt) * 60_000
const archivo = `/tmp/monitor-permiso-${programaId.slice(0, 8)}.jsonl`

const base = await abrirBase({ url: config.DATABASE_URL, carpetaPglite: PGLITE_DIR })
const { repos } = crearContenedor({ db: base.db, config }).uow
const op = new OpenPaymentsService(config)

let programa = (await repos.programas.obtener(programaId))!
if (!programa.tokenAcceso || !programa.urlGestion) throw new Error('El programa no tiene token')
if (receptor.replace(/\/+$/, '') === programa.billeteraPrograma) throw new Error('El receptor no puede ser la billetera del programa (autopago)')
const moneda = { assetCode: programa.codigoMoneda, assetScale: programa.escalaMoneda }

/** Desde cuándo vale el token actual: la aprobación o la última rotación. */
async function inicioDelToken(): Promise<{ desde: number; expiraEnSeg: number | null; origen: string }> {
  const eventos = await repos.eventos.de('programa', programaId)
  const detalle = (e: (typeof eventos)[number]) => e.detalle as { texto?: unknown; expiresIn?: unknown }
  const ultimo = [...eventos].reverse().find((e) => e.estadoNuevo === 'Activo' || detalle(e).texto === 'Se rotó el token del permiso.')
  const expira = ultimo ? detalle(ultimo).expiresIn : undefined
  return {
    desde: ultimo ? Date.parse(ultimo.creadoEn) : Date.now(),
    expiraEnSeg: typeof expira === 'number' ? expira : null,
    origen: ultimo?.estadoNuevo === 'Activo' ? 'aprobacion' : 'rotacion',
  }
}

const describir = (e: unknown) => {
  const x = e as { tipo?: string; status?: number; description?: string; message?: string }
  return { tipo: x.tipo ?? null, status: x.status ?? null, descripcion: x.description ?? x.message ?? String(e) }
}

function registrar(fila: Record<string, unknown>) {
  const linea = JSON.stringify({ hora: new Date().toISOString(), ...fila })
  appendFileSync(archivo, linea + '\n')
  console.log(linea)
}

let token = await inicioDelToken()
registrar({ evento: 'inicio', programa: programa.nombre, billetera: programa.billeteraPrograma, receptor, tokenDesde: new Date(token.desde).toISOString(), expiraEnSeg: token.expiraEnSeg, origen: token.origen })

let primerFallo: Record<string, unknown> | null = null
let rotacion: Record<string, unknown> | null = null
let ultimoPagoOk: number | null = null
let vueltasTrasFallo = 0

while (Date.now() < finEn) {
  const edadSeg = Math.round((Date.now() - token.desde) / 1000)
  programa = (await repos.programas.obtener(programaId))!

  let lectura: unknown
  try {
    lectura = { ok: true, gastado: await op.gastadoDelPermiso({ billeteraPrograma: programa.billeteraPrograma, token: programa.tokenAcceso! }) }
  } catch (e) {
    lectura = { ok: false, ...describir(e) }
  }

  let pago: Record<string, unknown>
  try {
    const entrante = await op.crearPagoEntrante({ billetera: receptor, monto: 1, moneda, referencia: `MON-${edadSeg}`, descripcion: 'Monitor del permiso (0,01)' })
    const s = await op.crearPagoSaliente({ billeteraPrograma: programa.billeteraPrograma, token: programa.tokenAcceso!, urlPagoEntrante: entrante.id, monto: 1, moneda, referencia: `MON-${edadSeg}` })
    pago = { ok: true, fallido: s.fallido }
    ultimoPagoOk = edadSeg
  } catch (e) {
    pago = { ok: false, ...describir(e) }
  }
  registrar({ evento: 'sonda', edadTokenSeg: edadSeg, lectura, pago })

  if (!pago.ok && !primerFallo) {
    primerFallo = { edadTokenSeg: edadSeg, ultimoPagoOkSeg: ultimoPagoOk, ...pago }
    if (pago.tipo === 'TokenVencido') {
      // Lo mismo que hace Tatú: rotar una vez. Así se sabe si el banco deja rotar un token en este estado.
      try {
        const nuevo = await op.rotarToken({ urlGestion: programa.urlGestion!, token: programa.tokenAcceso! })
        await repos.programas.actualizar(programaId, { tokenAcceso: nuevo.token, urlGestion: nuevo.urlGestion }, programa.estado)
        await repos.eventos.registrar({ tipoEntidad: 'programa', idEntidad: programaId, detalle: { texto: 'Se rotó el token del permiso.', expiresIn: nuevo.expiraEnSeg ?? null, origen: 'monitor' } })
        rotacion = { ok: true, edadTokenSeg: edadSeg, expiraEnSeg: nuevo.expiraEnSeg ?? null }
        token = await inicioDelToken()
        // A partir de aquí se mide la vida del token nuevo
        primerFallo = { ...primerFallo, recuperado: true }
      } catch (e) {
        rotacion = { ok: false, edadTokenSeg: edadSeg, ...describir(e) }
      }
      registrar({ evento: 'rotacion', ...rotacion })
    }
  }
  if (primerFallo && !rotacion?.ok) {
    vueltasTrasFallo++
    if (vueltasTrasFallo > 2) break
  }
  await new Promise((r) => setTimeout(r, intervaloMs))
}

registrar({ evento: 'resumen', primerFallo, rotacion, ultimoPagoOkSeg: ultimoPagoOk, archivo })
await base.cerrar()
