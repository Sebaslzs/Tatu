// Puerto de pagos de Open Payments (HU-09, HU-12): pago entrante en la billetera de destino y pago
// saliente desde la cuenta del programa con el token del permiso. Solo openPaymentsService.ts conoce
// el SDK (AD-07).
import type { Moneda } from '../comun/montos.ts'

export interface PagoEntrante {
  /** URL del pago entrante: es lo que se guarda en el cobro. */
  id: string
  completado: boolean
  recibido: string
  esperado?: string | undefined
}

export interface PagoSaliente {
  /** URL del pago saliente: es lo que se guarda en el cobro. */
  id: string
  fallido: boolean
  debitado: string
  enviado: string
}

export interface PuertoPagos {
  /** Pago entrante de monto fijo en la billetera de destino (cuenta o punto); la referencia viaja en el `metadata`. */
  crearPagoEntrante(args: { billetera: string; monto: number; moneda: Moneda; referencia: string; descripcion: string }): Promise<PagoEntrante>
  leerPagoEntrante(args: { url: string; billetera: string }): Promise<PagoEntrante>
  /** Pago saliente con `incomingPayment` + `debitAmount`: sin cotización (AD-10). */
  crearPagoSaliente(args: {
    billeteraPrograma: string
    token: string
    urlPagoEntrante: string
    monto: number
    moneda: Moneda
    referencia: string
  }): Promise<PagoSaliente>
  leerPagoSaliente(args: { url: string; token: string }): Promise<PagoSaliente>
}
