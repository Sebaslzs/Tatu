// Fachada del módulo de cobros: las rutas hablan con esta clase; cada paso lo hace su colaborador
// (solicitud, confirmación, pagador). Aquí solo está la consulta, que une reconciliación y vencimiento.
import type { ConfirmacionCobro } from './confirmacion.ts'
import type { MovimientosCobro } from './movimientos.ts'
import type { PagadorCobros } from './pagador.ts'
import type { EntradaCobro, SolicitudCobro } from './solicitud.ts'
import type { VistaCobro, VistasCobro } from './vista.ts'

export interface DependenciasServicioCobros {
  solicitud: SolicitudCobro
  confirmacion: ConfirmacionCobro
  pagador: PagadorCobros
  movimientos: MovimientosCobro
  vistas: VistasCobro
}

export class ServicioCobros {
  private readonly deps: DependenciasServicioCobros

  constructor(deps: DependenciasServicioCobros) {
    this.deps = deps
  }

  solicitar(entrada: EntradaCobro): Promise<VistaCobro> {
    return this.deps.solicitud.solicitar(entrada)
  }

  confirmar(id: string, pin: string): Promise<{ status: number; cobro: VistaCobro }> {
    return this.deps.confirmacion.confirmar(id, pin)
  }

  cancelar(id: string): Promise<VistaCobro> {
    return this.deps.confirmacion.cancelar(id)
  }

  /** CA-12.02: consultar vence lo que venció y, si el cobro está Pagando, pregunta al banco (RN-10). */
  async consultar(id: string): Promise<VistaCobro> {
    const { confirmacion, movimientos, pagador, vistas } = this.deps
    let c = await confirmacion.aplicarVencimiento(await movimientos.exigir(id))
    if (c.estado === 'Pagando') {
      await pagador.reconciliar(c)
      c = await movimientos.exigir(id)
    }
    return vistas.una(c)
  }

  /** Para pruebas y para el cierre ordenado: espera los pagos que estén en curso. */
  esperarPagos(): Promise<void> {
    return this.deps.pagador.esperar()
  }

  /** RNF-05: al arrancar, retoma los cobros que quedaron en Pagando. */
  recuperarAlArrancar(): Promise<number> {
    return this.deps.pagador.recuperarAlArrancar()
  }
}
