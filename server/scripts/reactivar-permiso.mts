// Quita la marca de «permiso vencido» de un programa (cuando se marcó sin estarlo) y prueba con un
// pago de 0,01 COP que vuelva a pagar. Usa la misma puerta que Tatú: si el token expiró, lo rota.
// Uso: pnpm --filter server exec tsx scripts/reactivar-permiso.mts <programaId> <receptor>
import { config, PGLITE_DIR } from '../src/config.ts'
import { crearContenedor } from '../src/contenedor.ts'
import { abrirBase } from '../src/db/conexion.ts'
import { OpenPaymentsService } from '../src/openPaymentsService.ts'

const [idArg, receptorArg] = process.argv.slice(2)
if (!idArg || !receptorArg) throw new Error('Uso: <programaId> <receptor>')
const programaId: string = idArg
const receptor: string = receptorArg

const base = await abrirBase({ url: config.DATABASE_URL, carpetaPglite: PGLITE_DIR })
const contenedor = crearContenedor({ db: base.db, config, candado: base.conCandado })
const { repos } = contenedor.uow
const p = (await repos.programas.obtener(programaId))!
console.log('antes', { estado: p.estado, permisoVencidoEn: p.permisoVencidoEn })

if (p.permisoVencidoEn) {
  await repos.programas.actualizar(programaId, { permisoVencidoEn: null }, p.estado)
  await repos.eventos.registrar({
    tipoEntidad: 'programa',
    idEntidad: programaId,
    detalle: { texto: 'Se quitó la marca de permiso vencido: la había puesto una rotación simultánea, no el banco.' },
  })
  console.log('marca de vencido quitada')
}

const op = new OpenPaymentsService(config)
const moneda = { assetCode: p.codigoMoneda, assetScale: p.escalaMoneda }
try {
  const entrante = await op.crearPagoEntrante({ billetera: receptor, monto: 1, moneda, referencia: 'REACT-1', descripcion: 'Prueba tras reactivar (0,01)' })
  const s = await contenedor.token.conToken(programaId, (t, actual) =>
    op.crearPagoSaliente({ billeteraPrograma: actual.billeteraPrograma, token: t, urlPagoEntrante: entrante.id, monto: 1, moneda, referencia: 'REACT-1' }),
  )
  console.log('PAGO OK', { fallido: s.fallido, debitado: s.debitado })
} catch (e) {
  const x = e as { tipo?: string; status?: number; description?: string; message?: string }
  console.log('PAGO FALLÓ', { tipo: x.tipo, status: x.status, descripcion: x.description ?? x.message })
}
const d = (await repos.programas.obtener(programaId))!
console.log('despues', { estado: d.estado, permisoVencidoEn: d.permisoVencidoEn })
for (const e of (await repos.eventos.de('programa', programaId)).slice(-3)) console.log('  ', e.creadoEn, JSON.stringify(e.detalle).slice(0, 140))
await base.cerrar()
