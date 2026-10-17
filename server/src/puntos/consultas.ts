// Lo que el punto consulta (HU-10, CA-10.01): qué subsidios puede pagarle hoy a una cédula, los
// cobros que ha hecho y su caja. Una cédula que no existe responde igual que una sin pagos: no se
// filtra si existía.
import { ErrorApi, noEncontrado } from '../comun/errores.ts'
import { inicioDeHoyEnBogota, type Reloj } from '../comun/fechas.ts'
import { monto, type Moneda, type Monto } from '../comun/montos.ts'
import { ultimoHaciaEn } from '../db/repositorios/eventos.ts'
import type { FilaPunto } from '../db/repositorios/puntos.ts'
import type { UnidadDeTrabajo } from '../db/unidadDeTrabajo.ts'
import type { PagoPendiente, PagosPendientes } from '../beneficiarios/pagosPendientes.ts'
import type { VistaCobro, VistasCobro } from '../cobros/vista.ts'
import { MOTIVOS } from '../cobros/mensajes.ts'
import { LiquidacionNoResponde } from '../liquidacion/cliente.ts'
import { monedaDe } from '../programas/vista.ts'
import { vistaPunto, type VistaPunto } from './servicio.ts'

export type PeriodoCaja = 'hoy' | '7d' | 'todo'

export interface PagosParaElPunto {
  persona: { nombre: string; tienePin: boolean }
  pagos: PagoPendiente[]
}

/** Lo que movió el punto en una moneda. */
export interface TotalCaja {
  /** El efectivo entregado: los cobros Pagado. */
  entregado: Monto
  /** Igual a lo entregado: el punto solo entrega al ver «Pagado», y Pagado es el reembolso ya recibido en su billetera. */
  reembolsado: Monto
  /** Los cobros Pagando: el reembolso va en camino y ese efectivo todavía no se entrega. */
  pendiente: Monto
  /** Siempre 0: el punto nunca gira plata antes de que le paguen. */
  giradoPorAdelantado: Monto
}

/** La caja del punto en un periodo: cuánto entregó, cuánto le reembolsaron y en cuánto tiempo. */
export interface CajaPunto {
  punto: VistaPunto
  periodo: PeriodoCaja
  /** Una fila por moneda: un punto puede atender programas en monedas distintas (en la demo, todo es COP). */
  totales: TotalCaja[]
  cobros: { pagados: number; enCurso: number; rechazados: number }
  /** Promedio de segundos del PIN (Pagando) a Pagado; null si no hay retiros pagados en el periodo. */
  reembolsoSegundos: number | null
}

const DIA_MS = 86_400_000

export class ConsultasPunto {
  private readonly uow: UnidadDeTrabajo
  private readonly pagosPendientes: PagosPendientes
  private readonly vistas: VistasCobro
  private readonly reloj: Reloj

  constructor(deps: { uow: UnidadDeTrabajo; pagosPendientes: PagosPendientes; vistas: VistasCobro; reloj: Reloj }) {
    this.uow = deps.uow
    this.pagosPendientes = deps.pagosPendientes
    this.vistas = deps.vistas
    this.reloj = deps.reloj
  }

  /** CA-10.01: el punto digita la cédula y ve «Pago disponible» con la persona y sus pagos. */
  async pagosDe(puntoId: string, cedula: string): Promise<PagosParaElPunto> {
    const punto = await this.exigirPunto(puntoId)
    const persona = await this.uow.repos.beneficiarios.porCedula(cedula)
    // Igual que un cobro con una cédula desconocida: no se dice si existe
    if (!persona) throw new ErrorApi(404, 'SinPagoDisponible', 'Esta cédula no tiene pagos disponibles')
    const [{ pagos, liquidacionDisponible }, personas] = await Promise.all([
      this.pagosPendientes.de(persona, { soloQueReciben: true, puntoId: punto.id }),
      this.vistas.personas([cedula]),
    ])
    if (!pagos.length && !liquidacionDisponible) throw new LiquidacionNoResponde()
    if (!pagos.length) throw new ErrorApi(404, 'SinPagoDisponible', MOTIVOS.SinPagoDisponible.mensaje)
    const p = personas.get(cedula)
    return { persona: { nombre: p?.nombre ?? `Persona ${cedula.slice(-4)}`, tienePin: p?.tienePin ?? false }, pagos }
  }

  /** Los cobros del punto, del más reciente al más antiguo, en el periodo pedido. */
  async cobrosDe(puntoId: string, periodo: PeriodoCaja): Promise<VistaCobro[]> {
    const punto = await this.exigirPunto(puntoId)
    const cobros = await this.uow.repos.cobros.dePunto(punto.id, this.desde(periodo))
    return this.vistas.de(cobros, { eventos: false })
  }

  /** La caja del punto: lo entregado (que ya le reembolsaron), lo que va en camino y en cuánto tiempo le pagan. */
  async caja(puntoId: string, periodo: PeriodoCaja): Promise<CajaPunto> {
    const { repos } = this.uow
    const punto = await this.exigirPunto(puntoId)
    const cobros = await repos.cobros.dePunto(punto.id, this.desde(periodo))
    // Los programas y los eventos de la lista, de una vez
    const [programas, eventos] = await Promise.all([
      repos.programas.deIds(cobros.map((c) => c.programaId)),
      repos.eventos.deVarias('cobro', cobros.map((c) => c.id)),
    ])

    const totales = new Map<string, { moneda: Moneda; entregado: number; pendiente: number }>()
    for (const c of cobros.filter((x) => x.estado === 'Pagado' || x.estado === 'Pagando')) {
      const moneda = monedaDe(programas.get(c.programaId)!)
      const clave = `${moneda.assetCode}/${moneda.assetScale}`
      const t = totales.get(clave) ?? { moneda, entregado: 0, pendiente: 0 }
      if (c.estado === 'Pagado') t.entregado += c.monto ?? 0
      else t.pendiente += c.monto ?? 0
      totales.set(clave, t)
    }

    // Del PIN (PorConfirmar → Pagando) al reembolso (Pagado)
    const pagados = cobros.filter((c) => c.estado === 'Pagado')
    const tiempos = pagados
      .map((c) => {
        const desde = ultimoHaciaEn(eventos.get(c.id), 'Pagando')?.creadoEn
        const hasta = ultimoHaciaEn(eventos.get(c.id), 'Pagado')?.creadoEn
        return desde && hasta ? (Date.parse(hasta) - Date.parse(desde)) / 1000 : null
      })
      .filter((t): t is number => t !== null)

    return {
      punto: vistaPunto(punto),
      periodo,
      totales: [...totales.values()].map((t) => ({
        entregado: monto(t.entregado, t.moneda),
        reembolsado: monto(t.entregado, t.moneda),
        pendiente: monto(t.pendiente, t.moneda),
        giradoPorAdelantado: monto(0, t.moneda),
      })),
      cobros: {
        pagados: pagados.length,
        enCurso: cobros.filter((c) => c.estado === 'Solicitado' || c.estado === 'PorConfirmar' || c.estado === 'Pagando').length,
        rechazados: cobros.filter((c) => c.estado === 'Rechazado' || c.estado === 'Fallido').length,
      },
      reembolsoSegundos: tiempos.length ? Math.round((tiempos.reduce((a, b) => a + b, 0) / tiempos.length) * 10) / 10 : null,
    }
  }

  private desde(periodo: PeriodoCaja): string | undefined {
    const hoy = inicioDeHoyEnBogota(this.reloj())
    if (periodo === 'hoy') return hoy.toISOString()
    if (periodo === '7d') return new Date(hoy.getTime() - 6 * DIA_MS).toISOString()
    return undefined
  }

  private async exigirPunto(id: string): Promise<FilaPunto> {
    const punto = await this.uow.repos.puntos.obtener(id)
    if (!punto) throw noEncontrado('Ese punto no existe', 'PuntoNoEncontrado')
    return punto
  }
}
