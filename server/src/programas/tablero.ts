// Tablero (HU-15) y cierre (HU-17) del programa. Lo cobrado sale del permiso en el banco
// (getGrantSpentAmounts); si el banco no responde, de lo Pagado en la base («plataforma»). Al cerrar,
// las cifras se guardan en el evento de cierre antes de revocar el permiso: después ya no se pueden leer.
import { ErrorApi, conflicto } from '../comun/errores.ts'
import { log } from '../comun/log.ts'
import { monedaCodigo, monto, type MonedaCodigo, type Monto } from '../comun/montos.ts'
import { errorOpApi } from '../comun/openPayments.ts'
import { detalleDe, ultimoHaciaEn } from '../db/repositorios/eventos.ts'
import type { FilaCobro } from '../db/repositorios/cobros.ts'
import type { FilaPrograma } from '../db/repositorios/programas.ts'
import type { UnidadDeTrabajo } from '../db/unidadDeTrabajo.ts'
import type { VistaCobro, VistasCobro } from '../cobros/vista.ts'
import type { PuertoLiquidacion } from '../liquidacion/contrato.ts'
import type { LectorProgramas } from './lector.ts'
import { PermisoVencido, type ServicioPermisoToken } from './permisoToken.ts'
import type { PuertoPermisos } from './puertos.ts'
import type { Canal } from './reglas.ts'
import { SIN_TEMPORALES, type Transiciones } from './transiciones.ts'
import { monedaDe, type VistaPrograma } from './vista.ts'

/** «banco»: leído del permiso; «plataforma»: suma de lo Pagado en la base. */
export type Fuente = 'banco' | 'plataforma'

export const PALABRA_CIERRE = 'CERRAR'

/** Cuánto se reutiliza lo gastado que dijo el banco: el tablero se consulta cada 5 s. */
const CACHE_GASTADO_MS = 3000

export interface PorCanal {
  cobros: number
  monto: Monto
}

export interface VistaTablero {
  programa: VistaPrograma
  moneda: MonedaCodigo
  autorizado: Monto
  cobrado: Monto
  fuente: Fuente
  noHaSalido: Monto
  cobrosPagados: number
  porCanal: Record<Canal, PorCanal>
  /** Promedio de segundos del PIN a Pagado en los retiros; null sin retiros pagados. */
  reembolsoSegundos: number | null
  /** El modelo no gira nada antes del cobro: cada pago sale cuando la persona cobra. */
  giradoPorAdelantado: Monto
  /** Cédulas de la liquidación que no han cobrado; null si la liquidación no responde. */
  sinCobrar: { cedulas: number; monto: Monto } | null
  cobrosPagando: number
  rechazadosYFallidos: number
  cobros: VistaCobro[]
  /** Solo en un programa Cerrado: las cifras guardadas al cerrar. */
  cierre: { autorizado: Monto; cobrado: Monto; nuncaSalio: Monto; cerradoEn: string } | null
  actualizado: string
}

export interface DependenciasTablero {
  uow: UnidadDeTrabajo
  lector: LectorProgramas
  transiciones: Transiciones
  permisos: PuertoPermisos
  token: ServicioPermisoToken
  liquidacion: PuertoLiquidacion
  vistas: VistasCobro
}

interface DatosCierre {
  autorizado: number
  cobrado: number
  nuncaSalio: number
  fuente: Fuente
  cerradoEn: string
}

const sumar = (lista: readonly FilaCobro[]) => lista.reduce((total, c) => total + (c.monto ?? 0), 0)

export class ServicioTablero {
  private readonly deps: DependenciasTablero
  private readonly cacheGastado = new Map<string, { valor: number; vence: number }>()

  constructor(deps: DependenciasTablero) {
    this.deps = deps
  }

  /** CA-15.01 a CA-15.03: autorizado, cobrado, lo que no ha salido, por canal, y los cobros. */
  async tablero(id: string): Promise<VistaTablero> {
    const { lector, transiciones, uow, vistas, liquidacion } = this.deps
    const p = await transiciones.aplicarVencimiento(await lector.exigir(id))
    const lista = await uow.repos.cobros.dePrograma(p.id)
    const pagados = lista.filter((c) => c.estado === 'Pagado')
    // Todo lo de la lista en una consulta por tabla, en paralelo con el gastado y la liquidación
    const [ctx, cobrado, resumen, cierre, programa] = await Promise.all([
      vistas.contextoDe(lista),
      this.cobrado(p),
      liquidacion.resumen(p.id).catch(() => null),
      p.estado === 'Cerrado' ? this.datosDelCierre(p.id) : Promise.resolve(null),
      lector.vista(p),
    ])
    const moneda = monedaDe(p)
    const m = (valor: number) => monto(valor, moneda)
    const autorizado = p.topeTotal ?? 0

    // Reembolso al punto: de PorConfirmar → Pagando (el PIN) a Pagado, en los retiros
    const tiempos = pagados
      .filter((c) => c.canal === 'retiro')
      .map((c) => {
        const eventos = ctx.eventos.get(c.id)
        const desde = ultimoHaciaEn(eventos, 'Pagando')?.creadoEn
        const hasta = ultimoHaciaEn(eventos, 'Pagado')?.creadoEn
        return desde && hasta ? (Date.parse(hasta) - Date.parse(desde)) / 1000 : null
      })
      .filter((t): t is number => t !== null)
    const reembolsoSegundos = tiempos.length ? Math.round((tiempos.reduce((a, b) => a + b, 0) / tiempos.length) * 10) / 10 : null

    const porCanal = (canal: Canal): PorCanal => {
      const deCanal = pagados.filter((c) => c.canal === canal)
      return { cobros: deCanal.length, monto: m(sumar(deCanal)) }
    }

    return {
      programa,
      moneda: monedaCodigo(moneda),
      autorizado: m(autorizado),
      cobrado: m(cobrado.valor),
      fuente: cobrado.fuente,
      noHaSalido: m(Math.max(0, autorizado - cobrado.valor)),
      cobrosPagados: pagados.length,
      porCanal: { cuenta: porCanal('cuenta'), retiro: porCanal('retiro'), compra: porCanal('compra') },
      reembolsoSegundos,
      giradoPorAdelantado: m(0),
      sinCobrar: resumen
        ? { cedulas: Math.max(0, resumen.cedulas - pagados.length), monto: m(Math.max(0, resumen.total - sumar(pagados))) }
        : null,
      cobrosPagando: lista.filter((c) => c.estado === 'Pagando').length,
      rechazadosYFallidos: lista.filter((c) => c.estado === 'Rechazado' || c.estado === 'Fallido').length,
      cobros: lista.map((c) => vistas.vista(c, ctx, { eventos: false })),
      cierre: cierre && { autorizado: m(cierre.autorizado), cobrado: m(cierre.cobrado), nuncaSalio: m(cierre.nuncaSalio), cerradoEn: cierre.cerradoEn },
      actualizado: new Date().toISOString(),
    }
  }

  /**
   * CA-17.01 a CA-17.04: con la palabra CERRAR y sin cobros Pagando, guarda las cifras, revoca el
   * permiso en el banco (`token.revoke`) y deja el programa Cerrado. No se puede deshacer.
   */
  async cerrar(id: string, confirmacion: string): Promise<VistaTablero> {
    const { lector, transiciones, uow, permisos, token } = this.deps
    if (confirmacion.trim().toUpperCase() !== PALABRA_CIERRE) {
      throw new ErrorApi(400, 'ConfirmacionRequerida', `Escribe ${PALABRA_CIERRE} para confirmar`)
    }
    const p = await lector.exigir(id)
    transiciones.exigirEstado(p, 'Activo', 'Pausado')
    if ((await uow.repos.cobros.cuantosEnEstado(p.id, 'Pagando')) > 0) {
      throw conflicto('CobrosEnCurso', 'Hay cobros pagándose; espera a que terminen para cerrar')
    }

    // Antes de revocar se lee el gastado: con el permiso revocado el banco ya no lo da
    const { valor, fuente } = await this.cobrado(p)
    try {
      await token.conToken(p.id, (t, actual) => permisos.revocarPermiso({ urlGestion: actual.urlGestion!, token: t }))
    } catch (e) {
      // Si el token ya no sirve ni rotándolo, el permiso está muerto de todos modos: se cierra igual
      if (!(e instanceof PermisoVencido)) throw errorOpApi(e, 'El banco no confirmó la revocación del permiso')
      log.warn('El permiso ya estaba vencido al cerrar; se cierra igual', { programa: id })
    }

    const actual = await lector.exigir(id)
    const autorizado = actual.topeTotal ?? 0
    const cambiado = await transiciones.aplicar(
      actual,
      'Cerrado',
      { ...SIN_TEMPORALES, tokenAcceso: null, urlGestion: null },
      { texto: 'Programa cerrado: se revocó el permiso.', autorizado, cobrado: valor, nuncaSalio: Math.max(0, autorizado - valor), fuente },
    )
    if (!cambiado) throw conflicto('EstadoNoPermite', 'El programa cambió mientras se cerraba')
    this.cacheGastado.delete(id)
    return this.tablero(id)
  }

  /** Lo gastado del permiso (más lo de permisos anteriores, si se renovó); si falla, lo Pagado en la base. */
  private async cobrado(p: FilaPrograma): Promise<{ valor: number; fuente: Fuente }> {
    if (p.estado === 'Cerrado') {
      const d = await this.datosDelCierre(p.id)
      if (d) return { valor: d.cobrado, fuente: d.fuente }
    }
    if ((p.estado === 'Activo' || p.estado === 'Pausado') && p.tokenAcceso && !p.permisoVencidoEn) {
      const guardado = this.cacheGastado.get(p.id)
      if (guardado && guardado.vence > Date.now()) return { valor: guardado.valor, fuente: 'banco' }
      try {
        // Leer no rota: con dos procesos rotando a la vez, el segundo daba el permiso por vencido
        const gastado = await this.deps.token.conTokenSinRotar(p.id, (t, actual) =>
          this.deps.permisos.gastadoDelPermiso({ billeteraPrograma: actual.billeteraPrograma, token: t }),
        )
        const anteriores = (await this.deps.lector.exigir(p.id)).gastadoPermisosAnteriores
        const valor = anteriores + (gastado ?? 0)
        this.cacheGastado.set(p.id, { valor, vence: Date.now() + CACHE_GASTADO_MS })
        return { valor, fuente: 'banco' }
      } catch (e) {
        log.warn('No se pudo leer lo gastado del permiso; se usa la suma de la base', { error: e, programa: p.id })
      }
    }
    return { valor: await this.deps.uow.repos.cobros.sumaPagada(p.id), fuente: 'plataforma' }
  }

  /** Las cifras que se guardaron en el evento de cierre, antes de revocar. */
  private async datosDelCierre(programaId: string): Promise<DatosCierre | null> {
    const e = await this.deps.uow.repos.eventos.ultimoHacia('programa', programaId, 'Cerrado')
    if (!e) return null
    const d = detalleDe(e)
    if (typeof d.cobrado !== 'number' || typeof d.autorizado !== 'number' || typeof d.nuncaSalio !== 'number') return null
    return {
      autorizado: d.autorizado,
      cobrado: d.cobrado,
      nuncaSalio: d.nuncaSalio,
      fuente: d.fuente === 'plataforma' ? 'plataforma' : 'banco',
      cerradoEn: e.creadoEn,
    }
  }
}
