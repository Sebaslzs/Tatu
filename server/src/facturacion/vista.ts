// Lo que la API muestra de una venta: lista blanca de campos, sin datos de la persona.
import { monto, type Moneda, type Monto } from '../comun/montos.ts'
import type { EstadoVenta, FilaVenta } from '../db/repositorios/ventas.ts'

export interface VistaVenta {
  id: string
  valor: Monto
  descripcion: string | null
  estado: EstadoVenta
  intentosEnvio: number
  ultimoError: string | null
  /** El id que devolvió el sistema de facturación, cuando la recibió. */
  referenciaFactura: string | null
  enviadaEn: string | null
}

export function vistaVenta(v: FilaVenta, moneda: Moneda): VistaVenta {
  return {
    id: v.id,
    valor: monto(v.valor, moneda),
    descripcion: v.descripcion,
    estado: v.estado,
    intentosEnvio: v.intentosEnvio,
    ultimoError: v.ultimoError,
    referenciaFactura: v.referenciaExterna,
    enviadaEn: v.enviadaEn,
  }
}
