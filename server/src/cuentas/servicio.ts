// Casos de uso de las cuentas del beneficiario (O3, HU-07): una llave Bre-B que resuelve el banco
// puente (RN-14 a RN-18) o una billetera Open Payments escrita a mano, verificada con un permiso con
// subject o, en el plan B (VERIFICACION_CUENTA=simulada), directamente.
import { randomUUID } from 'node:crypto'
import { resolverBilletera, type PuertoBilleteras } from '../comun/billeteras.ts'
import { ErrorApi, noEncontrado } from '../comun/errores.ts'
import type { Reloj } from '../comun/fechas.ts'
import { log } from '../comun/log.ts'
import { esUuid } from '../comun/parametros.ts'
import { errorOpApi } from '../comun/openPayments.ts'
import type { FilaBeneficiario } from '../db/repositorios/beneficiarios.ts'
import type { FilaCuenta } from '../db/repositorios/cuentas.ts'
import { actorBeneficiario, type Actor } from '../db/repositorios/eventos.ts'
import type { Repos, UnidadDeTrabajo } from '../db/unidadDeTrabajo.ts'
import type { PuertoLiquidacion } from '../liquidacion/contrato.ts'
import { verificarHash } from '../programas/hash.ts'
import { normalizarLlave, type PuertoPuente, type TipoLlave } from '../puente/contrato.ts'
import { enmascararLlave } from '../puente/enmascarar.ts'
import type { EntradaCuenta } from './esquemas.ts'
import type { PuertoVerificacionCuenta } from './puertos.ts'
import { vistaCuenta, type VistaCuenta } from './vista.ts'

export type ModoVerificacion = 'subject' | 'simulada'
export type ResultadoCuenta = 'verificada' | 'rechazada' | 'invalido'

/** Lo que la Test Wallet manda al volver a `GET /api/cuentas/callback/:id`. */
export interface ParametrosCallbackCuenta {
  hash?: string | undefined
  interact_ref?: string | undefined
  result?: string | undefined
}

export interface DependenciasCuentas {
  uow: UnidadDeTrabajo
  puente: PuertoPuente
  liquidacion: PuertoLiquidacion
  billeteras: PuertoBilleteras
  verificacion: PuertoVerificacionCuenta
  reloj: Reloj
  modoVerificacion: ModoVerificacion
  /** CA-07.05: cuánto espera una verificación antes de volver a SinEnlazar, en ms. */
  verificacionTtlMs: number
  apiBaseUrl: string
  appBaseUrl: string
  nuevoId?: () => string
}

export interface ResultadoEnlace {
  /** Enlace de consentimiento en la billetera; null si no hace falta aprobar nada. */
  redirect: string | null
  cuenta: VistaCuenta
}

export interface LlaveConsultada {
  tipoLlave: TipoLlave
  llave: string
  titular: string
}

const LLAVE_NO_EXISTE = 'No encontramos esa llave en Bre-B'
const LLAVE_AJENA = 'Esa llave no está a tu nombre'
const MENSAJE_BILLETERA = 'No encontramos esa billetera'

const SIN_TEMPORALES = { nonceCliente: null, nonceCierre: null, uriContinuacion: null, tokenContinuacion: null } as const

export class ServicioCuentas {
  private readonly deps: DependenciasCuentas

  constructor(deps: DependenciasCuentas) {
    this.deps = deps
  }

  /** CA-07.01: «¿Eres Ana M*** R***?» antes de enlazar una llave. */
  async consultarLlave(tipo: TipoLlave, valor: string): Promise<LlaveConsultada> {
    const llave = this.llaveLimpia(tipo, valor)
    const resolucion = await this.deps.puente.resolverLlave(tipo, llave)
    if (!resolucion) throw new ErrorApi(404, 'LlaveNoExiste', LLAVE_NO_EXISTE)
    return { tipoLlave: tipo, llave: enmascararLlave(tipo, llave), titular: resolucion.titular }
  }

  /** CA-07.01 a CA-07.07. */
  async enlazar(entrada: EntradaCuenta): Promise<ResultadoEnlace> {
    const persona = await this.persona(entrada.cedula)
    if ('tipoLlave' in entrada) return this.enlazarLlave(persona, entrada.tipoLlave, entrada.llave, entrada.pin)
    return this.enlazarBilletera(persona, entrada.billetera, entrada.pin)
  }

  /**
   * RN-17: «Cobrar a mi cuenta» sin cuenta enlazada. Si la cédula de la persona es una llave Bre-B,
   * se enlaza sola (RN-15) y se devuelve; si no, undefined. Puede lanzar `PuenteNoResponde`.
   */
  async cuentaPorCedula(persona: FilaBeneficiario): Promise<FilaCuenta | undefined> {
    const { uow, puente, billeteras } = this.deps
    const resolucion = await puente.resolverLlave('cedula', persona.numeroDocumento)
    if (!resolucion) return undefined
    let billetera: string
    try {
      billetera = (await billeteras.resolver(resolucion.billetera)).url
    } catch {
      return undefined
    }
    const id = this.nuevoId()
    try {
      await uow.transaccion(async (repos) => {
        await repos.cuentas.crear({
          id,
          beneficiarioId: persona.id,
          billetera,
          estado: 'Verificada',
          verificadaEn: this.ahora(),
          tipoLlave: 'cedula',
          llave: persona.numeroDocumento,
        })
        await repos.eventos.registrar({
          tipoEntidad: 'cuenta',
          idEntidad: id,
          estadoNuevo: 'Verificada',
          detalle: { texto: 'Tu cédula es una llave Bre-B: la enlazamos sola para cobrar.', tipoLlave: 'cedula', automatica: true },
          actor: actorBeneficiario(persona.id),
        })
      })
    } catch (e) {
      // Dos «Cobrar» a la vez: el índice de cuenta vigente deja pasar una sola
      const vigente = await uow.repos.cuentas.vigenteDe(persona.id)
      if (vigente) return vigente
      throw e
    }
    return uow.repos.cuentas.obtener(id)
  }

  /**
   * RN-18: antes de pagar, la llave se vuelve a resolver. Si cambió de billetera (la persona la movió
   * a otro banco), se guarda la nueva; si ya no existe, 'LlaveNoExiste'. Puede lanzar `PuenteNoResponde`.
   */
  async refrescarLlave(cuenta: FilaCuenta): Promise<FilaCuenta | 'LlaveNoExiste'> {
    const { uow, puente } = this.deps
    if (!cuenta.tipoLlave || !cuenta.llave) return cuenta
    const resolucion = await puente.resolverLlave(cuenta.tipoLlave, cuenta.llave)
    if (!resolucion) return 'LlaveNoExiste'
    const billetera = resolucion.billetera.replace(/\/+$/, '')
    if (billetera === cuenta.billetera) return cuenta
    await uow.transaccion(async (repos) => {
      if (await repos.cuentas.actualizar(cuenta.id, { billetera }, 'Verificada')) {
        await repos.eventos.registrar({
          tipoEntidad: 'cuenta',
          idEntidad: cuenta.id,
          detalle: { texto: 'Tu llave Bre-B ahora llega a otra cuenta: el pago va a la nueva.' },
        })
      }
    })
    return (await uow.repos.cuentas.obtener(cuenta.id)) ?? cuenta
  }

  /** CA-07.05: GET /cuentas/callback/:id → la URL de la web adonde redirigir. Nunca lanza por un callback malo. */
  async callback(id: string, q: ParametrosCallbackCuenta): Promise<string> {
    const { uow, verificacion } = this.deps
    if (!esUuid(id)) return this.urlRegreso('invalido')
    const encontrada = await uow.repos.cuentas.obtener(id)
    const cuenta = encontrada && (await this.aplicarVencimiento(encontrada))
    if (!cuenta) return this.urlRegreso('invalido')
    if (cuenta.estado === 'Verificada') return this.urlRegreso('verificada')
    if (cuenta.estado !== 'PorVerificar') return this.urlRegreso('rechazada')

    if (q.result === 'grant_rejected' || q.result === 'grant_invalid') {
      await this.desenlazar(cuenta, 'La verificación fue rechazada en el banco.')
      return this.urlRegreso('rechazada')
    }

    let urlPermiso: string
    try {
      urlPermiso = await verificacion.urlAutorizacion(cuenta.billetera)
    } catch {
      return this.urlRegreso('invalido')
    }
    const coincidencia =
      q.hash && q.interact_ref && cuenta.nonceCliente && cuenta.nonceCierre
        ? verificarHash(q.hash, { nonceCliente: cuenta.nonceCliente, nonceCierre: cuenta.nonceCierre, interactRef: q.interact_ref, urlPermiso })
        : null
    if (!coincidencia) {
      await uow.repos.eventos.registrar({ tipoEntidad: 'cuenta', idEntidad: id, detalle: { texto: 'Callback con hash inválido: se ignoró.' } })
      return this.urlRegreso('invalido')
    }

    let propia = false
    try {
      propia = await verificacion.continuarVerificacion({
        uriContinuacion: cuenta.uriContinuacion!,
        tokenContinuacion: cuenta.tokenContinuacion!,
        interactRef: q.interact_ref!,
        billetera: cuenta.billetera,
      })
    } catch (e) {
      if ((await uow.repos.cuentas.obtener(id))?.estado === 'Verificada') return this.urlRegreso('verificada')
      log.warn('grant.continue de la verificación falló', { error: e, cuenta: id })
    }
    if (!propia) {
      await this.desenlazar(cuenta, 'El banco no confirmó que la cuenta sea tuya.')
      return this.urlRegreso('rechazada')
    }

    await uow.transaccion(async (repos) => {
      if (await repos.cuentas.actualizar(id, { estado: 'Verificada', verificadaEn: this.ahora(), ...SIN_TEMPORALES }, 'PorVerificar')) {
        await repos.eventos.registrar({
          tipoEntidad: 'cuenta',
          idEntidad: id,
          estadoAnterior: 'PorVerificar',
          estadoNuevo: 'Verificada',
          detalle: { texto: 'Tu banco confirmó que la cuenta es tuya.', varianteHash: coincidencia.variante },
          actor: 'banco',
        })
      }
    })
    return this.urlRegreso('verificada')
  }

  /** Estado de la cuenta, que la web consulta mientras la persona aprueba. 404 si nunca enlazó una. */
  async estado(cedula: string): Promise<VistaCuenta> {
    const persona = await this.persona(cedula)
    const encontrada = await this.deps.uow.repos.cuentas.ultimaDe(persona.id)
    const cuenta = encontrada && (await this.aplicarVencimiento(encontrada))
    if (!cuenta) throw noEncontrado('Todavía no has enlazado una cuenta', 'CuentaNoEncontrada')
    return vistaCuenta(cuenta, persona.numeroDocumento)
  }

  // ---------------------------------------------------------------------------------------------

  /**
   * HU-07 con llave Bre-B. RN-15: una llave tipo cédula que es la cédula de la persona queda
   * Verificada sola. RN-16: las demás piden el PIN (si la persona lo tiene) y que el banco puente
   * confirme que el titular es esta cédula. Ninguna pasa por el permiso interactivo.
   */
  private async enlazarLlave(persona: FilaBeneficiario, tipo: TipoLlave, valor: string, pin: string | undefined): Promise<ResultadoEnlace> {
    const { puente, billeteras, uow } = this.deps
    const llave = this.llaveLimpia(tipo, valor)
    if (tipo === 'cedula') {
      if (llave !== persona.numeroDocumento) throw new ErrorApi(422, 'LlaveDeOtraPersona', LLAVE_AJENA)
    } else {
      await this.exigirPin(persona.numeroDocumento, pin)
    }
    const resolucion = await puente.resolverLlave(tipo, llave)
    if (!resolucion) throw new ErrorApi(404, 'LlaveNoExiste', LLAVE_NO_EXISTE)
    if (tipo !== 'cedula' && !(await puente.pertenece(tipo, llave, persona.numeroDocumento))) {
      throw new ErrorApi(422, 'LlaveDeOtraPersona', LLAVE_AJENA)
    }
    const billetera = (await resolverBilletera(billeteras, resolucion.billetera, MENSAJE_BILLETERA)).url
    const id = this.nuevoId()
    const actor = actorBeneficiario(persona.id)
    const cuenta = await uow.transaccion(async (repos) => {
      await this.reemplazarVigente(repos, persona, actor)
      const nueva = await repos.cuentas.crear({
        id,
        beneficiarioId: persona.id,
        billetera,
        estado: 'Verificada',
        verificadaEn: this.ahora(),
        tipoLlave: tipo,
        llave,
      })
      await repos.eventos.registrar({
        tipoEntidad: 'cuenta',
        idEntidad: id,
        estadoNuevo: 'Verificada',
        detalle: { texto: tipo === 'cedula' ? 'Tu cédula es tu llave Bre-B: queda lista para recibir.' : 'Bre-B confirmó que la llave es tuya.', tipoLlave: tipo },
        actor,
      })
      return nueva
    })
    return { redirect: null, cuenta: vistaCuenta(cuenta, persona.numeroDocumento) }
  }

  /** CA-07.05: una billetera escrita a mano, con permiso con subject o verificación simulada. */
  private async enlazarBilletera(persona: FilaBeneficiario, direccion: string, pin: string | undefined): Promise<ResultadoEnlace> {
    const { billeteras, uow, verificacion, modoVerificacion } = this.deps
    await this.exigirPin(persona.numeroDocumento, pin)
    const billetera = (await resolverBilletera(billeteras, direccion, MENSAJE_BILLETERA)).url
    const id = this.nuevoId()
    const actor = actorBeneficiario(persona.id)
    const simulada = modoVerificacion === 'simulada'

    const nonce = randomUUID()
    const pendiente = simulada
      ? undefined
      : await verificacion
          .pedirVerificacionCuenta({ billetera, nonce, urlRetorno: `${this.deps.apiBaseUrl}/cuentas/callback/${id}` })
          .catch((e: unknown) => {
            throw errorOpApi(e, 'No pudimos pedir la verificación a tu banco')
          })

    const cuenta = await uow.transaccion(async (repos) => {
      // Una sola cuenta vigente por persona (CA-07.06)
      await this.reemplazarVigente(repos, persona, actor)
      if (!pendiente) {
        const nueva = await repos.cuentas.crear({ id, beneficiarioId: persona.id, billetera, estado: 'Verificada', verificadaEn: this.ahora() })
        await repos.eventos.registrar({
          tipoEntidad: 'cuenta',
          idEntidad: id,
          estadoNuevo: 'Verificada',
          detalle: { texto: 'Verificación simulada (plan B): en producción la confirma el banco.', simulada: true },
          actor,
        })
        return nueva
      }
      const nueva = await repos.cuentas.crear({
        id,
        beneficiarioId: persona.id,
        billetera,
        estado: 'PorVerificar',
        creadoEn: this.ahora(),
        nonceCliente: nonce,
        nonceCierre: pendiente.nonceCierre,
        uriContinuacion: pendiente.uriContinuacion,
        tokenContinuacion: pendiente.tokenContinuacion,
      })
      await repos.eventos.registrar({ tipoEntidad: 'cuenta', idEntidad: id, estadoNuevo: 'PorVerificar', detalle: { texto: 'Esperando que apruebes en tu banco.' }, actor })
      return nueva
    })
    return { redirect: pendiente?.redirect ?? null, cuenta: vistaCuenta(cuenta, persona.numeroDocumento) }
  }

  /** Deja la cuenta vigente anterior como historial (índice de una sola cuenta vigente). */
  private async reemplazarVigente(repos: Repos, persona: FilaBeneficiario, actor: Actor): Promise<void> {
    const vigente = await repos.cuentas.vigenteDe(persona.id)
    if (!vigente) return
    await repos.cuentas.actualizar(vigente.id, { estado: 'SinEnlazar', verificadaEn: null, ...SIN_TEMPORALES })
    await repos.eventos.registrar({
      tipoEntidad: 'cuenta',
      idEntidad: vigente.id,
      estadoAnterior: vigente.estado,
      estadoNuevo: 'SinEnlazar',
      detalle: { texto: 'Se reemplazó por una cuenta nueva.' },
      actor,
    })
  }

  /** PorVerificar → SinEnlazar, con su evento. */
  private async desenlazar(cuenta: FilaCuenta, texto: string): Promise<void> {
    await this.deps.uow.transaccion(async (repos) => {
      if (await repos.cuentas.actualizar(cuenta.id, { estado: 'SinEnlazar', verificadaEn: null, ...SIN_TEMPORALES }, cuenta.estado)) {
        await repos.eventos.registrar({
          tipoEntidad: 'cuenta',
          idEntidad: cuenta.id,
          estadoAnterior: cuenta.estado,
          estadoNuevo: 'SinEnlazar',
          detalle: { texto },
        })
      }
    })
  }

  /** CA-07.05: pasado el tiempo sin respuesta, la cuenta vuelve a SinEnlazar. */
  private async aplicarVencimiento(cuenta: FilaCuenta): Promise<FilaCuenta | undefined> {
    if (cuenta.estado !== 'PorVerificar') return cuenta
    const { uow, reloj, verificacionTtlMs } = this.deps
    // Una cuenta nace PorVerificar: su creación (con la hora del reloj inyectado) es el inicio de la espera
    if (reloj().getTime() - Date.parse(cuenta.creadoEn) <= verificacionTtlMs) return cuenta
    await this.desenlazar(cuenta, 'La verificación venció sin respuesta.')
    return uow.repos.cuentas.obtener(cuenta.id)
  }

  /** Sin PIN registrado no hay qué validar; si lo tiene, es obligatorio y debe coincidir (CA-07.03). */
  private async exigirPin(cedula: string, pin: string | undefined): Promise<void> {
    const { liquidacion } = this.deps
    const tienePin = (await liquidacion.personas([cedula])).get(cedula)?.tienePin
    if (tienePin && !(pin && (await liquidacion.validarPin(cedula, pin)))) throw new ErrorApi(422, 'PinIncorrecto', 'PIN incorrecto')
  }

  private async persona(cedula: string): Promise<FilaBeneficiario> {
    const persona = await this.deps.uow.repos.beneficiarios.porCedula(cedula)
    if (!persona) throw noEncontrado('Esa cédula no está registrada', 'PersonaNoEncontrada')
    return persona
  }

  private llaveLimpia(tipo: TipoLlave, valor: string): string {
    const limpia = normalizarLlave(tipo, valor)
    if (!limpia) throw new ErrorApi(400, 'LlaveInvalida', 'Eso no parece una llave de ese tipo; revisa el tipo que elegiste')
    return limpia
  }

  private urlRegreso(resultado: ResultadoCuenta): string {
    return `${this.deps.appBaseUrl}/beneficiario/cuenta?resultado=${resultado}`
  }

  private nuevoId(): string {
    return (this.deps.nuevoId ?? randomUUID)()
  }

  private ahora(): string {
    return this.deps.reloj().toISOString()
  }
}
