// Sistema de facturación simulado (HU-27): en la demo hace el papel del software de facturación del
// comercio. Guarda cada solicitud por su `Idempotency-Key` (una sola por venta) y se puede poner
// «caído» o «rechaza» para mostrar que un fallo de facturación no toca el retiro.
import type { SolicitudFactura } from './contrato.ts'

export type ModoFacturacion = 'normal' | 'caido' | 'rechaza'

export interface FacturaRecibida {
  id: string
  idVenta: string
  recibidaEn: string
  solicitud: SolicitudFactura
}

export class FacturacionSimulada {
  modo: ModoFacturacion = 'normal'
  /** Cuántos POST llegaron, contando los repetidos y los que fallaron (para las pruebas). */
  intentos = 0
  private facturas = new Map<string, FacturaRecibida>()
  private consecutivo = 0

  /** Una solicitud nueva crea su factura; la misma llave devuelve la que ya existe (`nueva: false`). */
  recibir(llave: string, solicitud: SolicitudFactura): { factura: FacturaRecibida; nueva: boolean } {
    const existente = this.facturas.get(llave)
    if (existente) return { factura: existente, nueva: false }
    this.consecutivo += 1
    const factura = { id: `FAC-${String(this.consecutivo).padStart(4, '0')}`, idVenta: solicitud.idVenta, recibidaEn: new Date().toISOString(), solicitud }
    this.facturas.set(llave, factura)
    return { factura, nueva: true }
  }

  listar(): FacturaRecibida[] {
    return [...this.facturas.values()]
  }

  reiniciar(): void {
    this.modo = 'normal'
    this.intentos = 0
    this.facturas = new Map()
    this.consecutivo = 0
  }
}
