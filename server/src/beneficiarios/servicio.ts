// Registro del equipo de prueba: una persona es su cédula y su billetera. La cuenta queda Verificada
// de una vez, porque la registra el mismo equipo con la billetera de la persona; la verificación en
// el banco (HU-07) sigue disponible en «Mi cuenta». El PIN es opcional: sin él la persona solo cobra
// a su cuenta.
//
// Tatú guarda lo mínimo: la cédula y la billetera. El nombre y el PIN los inscribe «Equipo de
// prueba» en la liquidación (por HTTP). Con `cobraCon: 'llaveCedula'`, «Equipo de prueba» hace
// también de banco de la persona: registra su cédula como llave Bre-B en el banco puente, apuntando
// a su billetera. Tatú no le enlaza cuenta: al cobrar, RN-17 encuentra la llave sola.
import { randomUUID } from 'node:crypto'
import { billeteraCorta, resolverBilletera, type PuertoBilleteras } from '../comun/billeteras.ts'
import { conflicto, noEncontrado } from '../comun/errores.ts'
import type { Reloj } from '../comun/fechas.ts'
import { monedaApi, type Moneda, type MonedaApi } from '../comun/montos.ts'
import { esViolacionUnica } from '../db/errores.ts'
import type { FilaBeneficiario } from '../db/repositorios/beneficiarios.ts'
import type { FilaCuenta } from '../db/repositorios/cuentas.ts'
import type { UnidadDeTrabajo } from '../db/unidadDeTrabajo.ts'
import type { Persona, PuertoLiquidacion } from '../liquidacion/contrato.ts'
import type { PuertoPuente } from '../puente/contrato.ts'
import type { EntradaPersona } from './esquemas.ts'

export interface DependenciasBeneficiarios {
  uow: UnidadDeTrabajo
  liquidacion: PuertoLiquidacion
  puente: PuertoPuente
  billeteras: PuertoBilleteras
  reloj: Reloj
  nuevoId?: () => string
}

export interface VistaBeneficiario {
  documento: string
  nombre: string
  billetera: string | null
  billeteraCorta: string | null
  moneda: MonedaApi | null
  estadoCuenta: FilaCuenta['estado'] | null
  tienePin: boolean
  registrado: string
}

const YA_EXISTE = 'Esa cédula ya está registrada'
/** Cuánto se espera la moneda de una billetera antes de seguir sin ella (la Test Wallet puede tardar). */
const ESPERA_MONEDA_MS = 4000

export const nombreDe = (documento: string, personas?: Map<string, Persona>) => personas?.get(documento)?.nombre ?? `Persona ${documento.slice(-4)}`

/** El nombre que se inscribe: el escrito, el público de la billetera o «Persona 1234». */
function nombreParaInscribir(nombre: string | undefined, documento: string): string {
  const limpio = (nombre ?? '').trim().replace(/\s+/g, ' ').slice(0, 120)
  return limpio || `Persona ${documento.slice(-4)}`
}

export class ServicioBeneficiarios {
  private readonly deps: DependenciasBeneficiarios

  constructor(deps: DependenciasBeneficiarios) {
    this.deps = deps
  }

  async registrar(entrada: EntradaPersona): Promise<VistaBeneficiario> {
    const { uow, liquidacion, puente, billeteras } = this.deps
    if (await uow.repos.beneficiarios.porCedula(entrada.documento)) throw conflicto('PersonaExiste', YA_EXISTE)
    const wallet = await resolverBilletera(billeteras, entrada.billetera, 'No encontramos esa billetera')
    const conLlave = entrada.cobraCon === 'llaveCedula'
    const otra = conLlave ? undefined : await uow.repos.cuentas.vigentePorBilletera(wallet.url)
    if (otra) {
      const duena = await uow.repos.beneficiarios.obtener(otra.beneficiarioId)
      const nombres = duena ? await this.nombres([duena.numeroDocumento]) : new Map<string, Persona>()
      throw conflicto('BilleteraEnUso', `Esa billetera ya está registrada para ${duena ? nombreDe(duena.numeroDocumento, nombres) : 'otra persona'}`)
    }

    // 1. La liquidación (por HTTP). Inscribir es idempotente: si lo que sigue falla, se puede repetir.
    const inscrita = await liquidacion.inscribir(entrada.documento, nombreParaInscribir(entrada.nombre || wallet.nombre || undefined, entrada.documento), entrada.pin)
    // 1b. Su banco (el puente simulado): la cédula como llave Bre-B. También idempotente.
    if (conLlave) {
      await puente.registrarLlave({ tipo: 'cedula', valor: entrada.documento, documentoTitular: entrada.documento, nombreTitular: inscrita.nombre, billetera: wallet.url })
    }

    // 2. Tatú: solo la cédula y la cuenta
    let persona: FilaBeneficiario
    try {
      persona = await uow.transaccion(async (repos) => {
        const nueva = await repos.beneficiarios.crear(entrada.documento)
        if (conLlave) return nueva
        const cuentaId = (this.deps.nuevoId ?? randomUUID)()
        await repos.cuentas.crear({ id: cuentaId, beneficiarioId: nueva.id, billetera: wallet.url, estado: 'Verificada', verificadaEn: this.deps.reloj().toISOString() })
        await repos.eventos.registrar({
          tipoEntidad: 'cuenta',
          idEntidad: cuentaId,
          estadoNuevo: 'Verificada',
          detalle: { texto: 'Registrada por el equipo con la billetera de la persona; no se pidió confirmación al banco.', registro: true },
          actor: 'entidad',
        })
        return nueva
      })
    } catch (e) {
      // Dos registros de la misma cédula (o la misma billetera) a la vez: la base deja pasar solo uno
      if (esViolacionUnica(e)) throw conflicto('PersonaExiste', YA_EXISTE)
      throw e
    }
    const cuenta = await uow.repos.cuentas.ultimaDe(persona.id)
    return this.vista(persona, cuenta, new Map([[inscrita.documento, inscrita]]), { assetCode: wallet.assetCode, assetScale: wallet.assetScale })
  }

  async listar(): Promise<VistaBeneficiario[]> {
    const { uow } = this.deps
    const lista = await uow.repos.beneficiarios.listar()
    const [ultimas, personas] = await Promise.all([
      uow.repos.cuentas.ultimasDe(lista.map((b) => b.id)),
      this.nombres(lista.map((b) => b.numeroDocumento)),
    ])
    return Promise.all(
      lista.map(async (b) => {
        const cuenta = ultimas.get(b.id)
        return this.vista(b, cuenta, personas, cuenta ? await this.monedaDe(cuenta.billetera) : null)
      }),
    )
  }

  /** Para el selector de la entrada: nombre, etiqueta y cédula de prueba de cada persona registrada. */
  async demo(): Promise<{ nombre: string; etiqueta: string; documento: string }[]> {
    const lista = await this.deps.uow.repos.beneficiarios.listar()
    const personas = await this.nombres(lista.map((b) => b.numeroDocumento))
    return lista.map((b) => ({
      nombre: nombreDe(b.numeroDocumento, personas),
      etiqueta: `${b.tipoDocumento === 'CC' ? 'C.C.' : b.tipoDocumento} de prueba ${Number(b.numeroDocumento.slice(-3))}`,
      documento: b.numeroDocumento,
    }))
  }

  /** El PIN de alguien ya registrado: hace falta para retirar en un punto (lo guarda la liquidación). */
  async ponerPin(documento: string, pin: string): Promise<{ documento: string; tienePin: true }> {
    const registrada = await this.deps.uow.repos.beneficiarios.porCedula(documento)
    if (!registrada || !(await this.deps.liquidacion.ponerPin(documento, pin))) throw noEncontrado('Esa cédula no está registrada', 'PersonaNoEncontrada')
    return { documento, tienePin: true }
  }

  /** Los nombres los tiene la liquidación; si no responde, las pantallas siguen con «Persona 1234». */
  private async nombres(cedulas: readonly string[]): Promise<Map<string, Persona>> {
    try {
      return await this.deps.liquidacion.personas(cedulas)
    } catch {
      return new Map()
    }
  }

  /** La moneda de la billetera, sin colgar la lista si la Test Wallet tarda o no la encuentra. */
  private async monedaDe(billetera: string): Promise<Moneda | null> {
    let reloj: NodeJS.Timeout | undefined
    const limite = new Promise<null>((listo) => {
      reloj = setTimeout(() => listo(null), ESPERA_MONEDA_MS)
    })
    const lectura = this.deps.billeteras
      .resolver(billetera)
      .then((w) => ({ assetCode: w.assetCode, assetScale: w.assetScale }))
      .catch(() => null)
    try {
      return await Promise.race([lectura, limite])
    } finally {
      clearTimeout(reloj)
    }
  }

  private vista(persona: FilaBeneficiario, cuenta: FilaCuenta | undefined, personas: Map<string, Persona>, moneda: Moneda | null): VistaBeneficiario {
    return {
      documento: persona.numeroDocumento,
      nombre: nombreDe(persona.numeroDocumento, personas),
      billetera: cuenta?.billetera ?? null,
      billeteraCorta: cuenta ? billeteraCorta(cuenta.billetera) : null,
      moneda: moneda ? monedaApi(moneda) : null,
      estadoCuenta: cuenta?.estado ?? null,
      tienePin: personas.get(persona.numeroDocumento)?.tienePin ?? false,
      registrado: persona.creadoEn,
    }
  }
}
