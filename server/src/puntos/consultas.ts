// Lo que el punto consulta (HU-10, CA-10.01): qué subsidios puede pagarle hoy a una cédula, y los
// cobros que ha hecho. Una cédula que no existe responde igual que una sin pagos: no se filtra si existía.
import { ErrorApi, noEncontrado } from '../comun/errores.ts'
import { inicioDeHoyEnBogota, type Reloj } from '../comun/fechas.ts'
import type { FilaPunto } from '../db/repositorios/puntos.ts'
import type { UnidadDeTrabajo } from '../db/unidadDeTrabajo.ts'
import type { PagoPendiente, PagosPendientes } from '../beneficiarios/pagosPendientes.ts'
import type { VistaCobro, VistasCobro } from '../cobros/vista.ts'
import { MOTIVOS } from '../cobros/mensajes.ts'
import { LiquidacionNoResponde } from '../liquidacion/cliente.ts'

export type PeriodoCaja = 'hoy' | '7d' | 'todo'

export interface PagosParaElPunto {
  persona: { nombre: string; tienePin: boolean }
  pagos: PagoPendiente[]
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
  async pagosDe(puntoId: string, documento: string): Promise<PagosParaElPunto> {
    const punto = await this.exigirPunto(puntoId)
    const persona = await this.uow.repos.beneficiarios.porCedula(documento)
    // Igual que un cobro con una cédula desconocida: no se dice si existe
    if (!persona) throw new ErrorApi(404, 'SinPagoDisponible', 'Esta cédula no tiene pagos disponibles')
    const [{ pagos, liquidacionDisponible }, personas] = await Promise.all([
      this.pagosPendientes.de(persona, { soloQueReciben: true, puntoId: punto.id }),
      this.vistas.personas([documento]),
    ])
    if (!pagos.length && !liquidacionDisponible) throw new LiquidacionNoResponde()
    if (!pagos.length) throw new ErrorApi(404, 'SinPagoDisponible', MOTIVOS.SinPagoDisponible.mensaje)
    const p = personas.get(documento)
    return { persona: { nombre: p?.nombre ?? `Persona ${documento.slice(-4)}`, tienePin: p?.tienePin ?? false }, pagos }
  }

  /** Los cobros del punto, del más reciente al más antiguo, en el periodo pedido. */
  async cobrosDe(puntoId: string, periodo: PeriodoCaja): Promise<VistaCobro[]> {
    const punto = await this.exigirPunto(puntoId)
    const cobros = await this.uow.repos.cobros.dePunto(punto.id, this.desde(periodo))
    return this.vistas.de(cobros, { eventos: false })
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
