// Pagar un cobro (HU-09, HU-12): pago entrante en la billetera de destino y pago saliente desde la
// cuenta del programa con el token del permiso; y reconciliar lo que quedó a medias (CA-12.03).
//
// El cobro ya está en Pagando antes de llamar a Open Payments (CA-12.01): antes de Pagando no se
// movió dinero y después no hay rollback, solo consulta. Un error de red nunca lo marca Fallido.
import { log } from '../comun/log.ts'
import { ErrorOpenPayments } from '../comun/openPayments.ts'
import type { FilaCobro } from '../db/repositorios/cobros.ts'
import type { UnidadDeTrabajo } from '../db/unidadDeTrabajo.ts'
import { candadoDeCobro, sinCandado, type Candado } from '../programas/candados.ts'
import { monedaDe } from '../programas/vista.ts'
import { PermisoVencido, type ServicioPermisoToken } from '../programas/permisoToken.ts'
import type { MovimientosCobro } from './movimientos.ts'
import type { PuertoPagos } from './puertos.ts'
import { rn10Resultado } from './reglas.ts'

export interface DependenciasPagador {
  uow: UnidadDeTrabajo
  movimientos: MovimientosCobro
  pagos: PuertoPagos
  token: ServicioPermisoToken
  /** Candado de la base: entre instancias (Vercel) o servidores, un solo proceso paga cada cobro. */
  candado?: Candado
}

/** Otro proceso ya guardó la URL de este pago: este se retira sin crear nada más. */
class OtroProcesoPaga extends Error {
  constructor() {
    super('Otro proceso ya está pagando este cobro')
  }
}

/** Como máximo una consulta a Open Payments por cobro cada tanto, para no saturar al banco. */
const ESPERA_ENTRE_CONSULTAS_MS = 1000

export class PagadorCobros {
  private readonly deps: DependenciasPagador
  /** Un solo `pagar()` por cobro a la vez dentro de este proceso (entre procesos, el candado de la base). */
  private readonly enCurso = new Map<string, Promise<void>>()
  private readonly ultimaConsulta = new Map<string, number>()

  constructor(deps: DependenciasPagador) {
    this.deps = deps
  }

  /** Paga en segundo plano, después de responder: el cliente consulta el estado (CA-12.02). */
  disparar(id: string): void {
    if (this.enCurso.has(id)) return
    const promesa = this.pagar(id)
      .catch((e: unknown) => log.error('pagar() falló sin control', { error: e, cobro: id }))
      .finally(() => this.enCurso.delete(id))
    this.enCurso.set(id, promesa)
  }

  /** Para pruebas y para el cierre ordenado: espera los pagos que estén en curso. */
  async esperar(): Promise<void> {
    while (this.enCurso.size) await Promise.all([...this.enCurso.values()])
  }

  /** § reconciliar: una consulta al banco por cobro en Pagando; cierra el cobro si ya hay respuesta (RN-10). */
  async reconciliar(c: FilaCobro): Promise<void> {
    if (this.enCurso.has(c.id)) return
    const ahora = Date.now()
    if (ahora - (this.ultimaConsulta.get(c.id) ?? 0) < ESPERA_ENTRE_CONSULTAS_MS) return
    this.ultimaConsulta.set(c.id, ahora)

    // Sin pago entrante no se movió dinero: se puede volver a pagar
    if (!c.urlPagoEntrante) {
      this.disparar(c.id)
      return
    }
    const { pagos, token, movimientos } = this.deps
    try {
      if (c.urlPagoSaliente) {
        const saliente = await token.conToken(c.programaId, (t) => pagos.leerPagoSaliente({ url: c.urlPagoSaliente!, token: t }))
        let resultado = rn10Resultado({ saliente })
        if (resultado === 'Pagando') {
          const entrante = await pagos.leerPagoEntrante({ url: c.urlPagoEntrante, billetera: await this.destinoDe(c) })
          resultado = rn10Resultado({ saliente, entrante })
        }
        await this.cerrarSegun(await movimientos.exigir(c.id), resultado)
        return
      }
      // Solo el entrante: la base exige la URL del saliente para Pagado, así que se deja en Pagando
      // con un evento «requiere conciliación» (una vez) si el entrante ya se completó.
      const entrante = await pagos.leerPagoEntrante({ url: c.urlPagoEntrante, billetera: await this.destinoDe(c) })
      if (entrante.completado) await this.requiereConciliacion(c.id)
    } catch (e) {
      log.warn('No se pudo reconciliar el cobro', { error: e, cobro: c.id })
    }
  }

  /** RNF-05: al arrancar, retoma los cobros que quedaron en Pagando. No es un worker: una sola pasada. */
  async recuperarAlArrancar(): Promise<number> {
    const { uow, pagos } = this.deps
    const pendientes = await uow.repos.cobros.enEstado('Pagando')
    for (const c of pendientes) {
      try {
        if (c.urlPagoSaliente) await this.reconciliar(c)
        else if (c.urlPagoEntrante) {
          const entrante = await pagos.leerPagoEntrante({ url: c.urlPagoEntrante, billetera: await this.destinoDe(c) })
          log.info('Cobro con solo pago entrante', { cobro: c.id, completado: entrante.completado })
          await this.requiereConciliacion(c.id)
        } else this.disparar(c.id) // nada guardado: no se movió dinero
      } catch (e) {
        log.warn('No se pudo recuperar el cobro', { error: e, cobro: c.id })
      }
    }
    await this.esperar()
    return pendientes.length
  }

  // ---------------------------------------------------------------------------------------------

  /**
   * Con el candado de la base por cobro: si otro proceso (otra instancia de Vercel que atendió una
   * consulta del mismo cobro) ya lo está pagando, este no hace nada. Sin esto, cada instancia creaba
   * su propio pago entrante y podía llegar a un segundo pago saliente.
   */
  private async pagar(id: string): Promise<void> {
    const candado = this.deps.candado ?? sinCandado
    await candado(candadoDeCobro(id), () => this.pagarConCandado(id))
  }

  private async pagarConCandado(id: string): Promise<void> {
    const { uow, movimientos, pagos, token } = this.deps
    let c = await movimientos.exigir(id)
    if (c.estado !== 'Pagando') return
    const programa = (await uow.repos.programas.obtener(c.programaId))!
    const moneda = monedaDe(programa)
    try {
      // 1-2: el pago entrante se guarda ANTES de crear el saliente; es lo que permite recuperar
      if (!c.urlPagoEntrante) {
        const entrante = await pagos.crearPagoEntrante({
          billetera: await this.destinoDe(c),
          monto: c.monto!,
          moneda,
          referencia: c.referencia,
          descripcion: `${programa.nombre} · ${c.referencia}`,
        })
        c = await this.guardar(c, { urlPagoEntrante: entrante.id })
      }
      // 3: el saliente, con el token del permiso (que se rota si el banco ya no lo acepta)
      if (!c.urlPagoSaliente) {
        const urlEntrante = c.urlPagoEntrante!
        const saliente = await token.conToken(programa.id, (t) =>
          pagos.crearPagoSaliente({
            billeteraPrograma: programa.billeteraPrograma,
            token: t,
            urlPagoEntrante: urlEntrante,
            monto: c.monto!,
            moneda,
            referencia: c.referencia,
          }),
        )
        c = await this.guardar(c, { urlPagoSaliente: saliente.id })
        await this.cerrarSegun(c, rn10Resultado({ saliente }))
      }
    } catch (e) {
      // Otro proceso ganó el cobro: él lo cierra; este no lo marca Fallido
      if (e instanceof OtroProcesoPaga) {
        log.warn('Otro proceso ya pagaba este cobro; este se retira', { cobro: id })
        return
      }
      await this.manejarErrorPago(id, e)
    }
  }

  /** Qué le pasa al cobro con cada error del banco. */
  private async manejarErrorPago(id: string, e: unknown): Promise<void> {
    const { movimientos } = this.deps
    const c = await movimientos.exigir(id)
    if (c.estado !== 'Pagando') return
    if (e instanceof PermisoVencido) {
      await movimientos.mover(c, 'Fallido', { motivoRechazo: 'PermisoVencido' }, {}, 'banco')
      return
    }
    if (e instanceof ErrorOpenPayments) {
      const detalle = { status: e.status ?? null, code: e.code ?? null }
      switch (e.tipo) {
        case 'TopeSuperado': // RN-09: lo rechazó el banco, sin mover dinero
          await movimientos.mover(c, 'Fallido', { motivoRechazo: 'TopeSuperado' }, { error: e.code ?? 'InsufficientGrant', status: e.status ?? null }, 'banco')
          return
        case 'LlavesDistintas': // configuración: el permiso es de otro servidor; no se rota ni se marca
          await movimientos.mover(c, 'Fallido', { motivoRechazo: 'LlavesDistintas' }, detalle, 'banco')
          return
        case 'SinRespuesta': // nunca Fallido por un timeout: queda Pagando y se reconcilia al consultar
          await movimientos.nota(id, 'El banco no respondió a tiempo. Se reconcilia al consultar.', detalle)
          return
        default: // respuesta definitiva (4xx o sin configurar): no se creó el pago
          await movimientos.mover(c, 'Fallido', { motivoRechazo: 'ErrorPago' }, { ...detalle, tipo: e.tipo }, 'banco')
          return
      }
    }
    log.error('Error inesperado al pagar', { error: e, cobro: id })
    await movimientos.nota(id, 'Error inesperado al pagar. Se reconcilia al consultar.')
  }

  /** Aplica el resultado de RN-10 si es final. */
  private async cerrarSegun(c: FilaCobro, resultado: 'Pagado' | 'Fallido' | 'Pagando'): Promise<void> {
    const { movimientos } = this.deps
    if (resultado === 'Pagado') await movimientos.mover(c, 'Pagado', {}, {}, 'banco')
    else if (resultado === 'Fallido') await movimientos.mover(c, 'Fallido', { motivoRechazo: 'ErrorPago' }, {}, 'banco')
  }

  /**
   * Guarda la URL solo si el cobro sigue como este proceso lo leyó (misma versión). Si otro ya guardó
   * la suya, no se sobrescribe: este proceso se retira y no crea el pago saliente (sin doble pago).
   */
  private async guardar(leido: FilaCobro, campos: { urlPagoEntrante?: string; urlPagoSaliente?: string }): Promise<FilaCobro> {
    const { uow, movimientos } = this.deps
    if (!(await uow.repos.cobros.actualizar(leido.id, leido.version, campos))) throw new OtroProcesoPaga()
    return movimientos.exigir(leido.id)
  }

  private async requiereConciliacion(id: string): Promise<void> {
    const { uow, movimientos } = this.deps
    const eventos = await uow.repos.eventos.de('cobro', id)
    if (!eventos.some((e) => (e.detalle as Record<string, unknown>).conciliacion === true)) {
      await movimientos.nota(id, 'Requiere conciliación: el pago entrante existe pero no quedó guardado el saliente.', { conciliacion: true })
    }
  }

  private async destinoDe(c: FilaCobro): Promise<string> {
    const { repos } = this.deps.uow
    if (c.canal === 'cuenta') return (await repos.cuentas.obtener(c.cuentaId!))!.billetera
    return (await repos.puntos.obtener(c.puntoId!))!.billetera
  }
}
