// Lo que el punto consulta y pide a la API: los pagos de una cédula, sus cobros, su caja y los pasos
// del cobro (pedir, confirmar con el PIN, cancelar) y el reenvío de una venta a facturación. En un
// retiro el punto puede pedir solo una parte del saldo; la API lo valida y decide (HU-26).
import { http } from './http'
import type { Canal, Cobro, CobroResumen, Monto, Punto, Venta } from './tipos'

export type PeriodoCaja = 'hoy' | '7d' | 'todo'

/** Un subsidio (o un bono, en una sede de comercio) que el punto puede pagarle hoy a la cédula. */
export interface PagoPendiente {
  programa: { id: string; nombre: string; estado: string; tipo: 'subsidio' | 'bono' }
  /** Lo que puede cobrar hoy: en un subsidio, el saldo que le queda. */
  monto: Monto
  /** HU-26: lo que le asignó la liquidación y lo que ya cobró. */
  asignado: Monto
  cobrado: Monto
  /** HU-26: en un punto de retiro puede retirar solo una parte. */
  retiroParcial: boolean
  montoMinimo: Monto | null
  /** Último día para cobrar (AAAA-MM-DD, hora de Bogotá). */
  vigenciaFin: string
}

/** GET /puntos/:id/pagos?cedula=: la persona y lo que el punto puede pagarle hoy. */
export interface PagosEnPunto {
  persona: { nombre: string; tienePin: boolean }
  pagos: PagoPendiente[]
}

/** Lo que movió el punto en una moneda. Lo entregado es lo reembolsado: se entrega al ver «Pagado». */
export interface TotalCaja {
  /** El efectivo entregado: los retiros pagados menos las compras registradas en ellos. */
  entregado: Monto
  /** HU-27: compras que las personas pagaron con su retiro. */
  vendido: Monto
  reembolsado: Monto
  /** Cobros Pagando: el reembolso va en camino y ese efectivo todavía no se entrega. */
  pendiente: Monto
  /** Siempre 0: el punto nunca pone plata antes de que le paguen. */
  giradoPorAdelantado: Monto
}

/** GET /puntos/:id/resumen?desde=: la caja del punto. */
export interface CajaPunto {
  punto: Punto
  periodo: PeriodoCaja
  /** Una fila por moneda; en la demo, solo COP. Vacío si no hay cobros pagados ni en curso. */
  totales: TotalCaja[]
  cobros: { pagados: number; enCurso: number; rechazados: number }
  /** Promedio de segundos del PIN al reembolso; null sin retiros pagados. */
  reembolsoSegundos: number | null
}

export interface PedidoCobro {
  cedula: string
  canal: Exclude<Canal, 'cuenta'>
  puntoId: string
  /** Sin programa, la API toma el que tenga un pago disponible y deja el rechazo en pantalla (CA-10.04). */
  programaId?: string
  /** Solo en una compra con bono: el total de la compra en unidades mínimas. */
  totalCompra?: string
  /** HU-26: solo en un retiro, cuánto retirar (unidades mínimas); sin él, todo el saldo. */
  monto?: string
  /** HU-27: solo en un retiro, la compra que la persona hizo en el punto; es parte del retiro. */
  venta?: { valor: string; descripcion?: string }
  /** Una por intento: el doble clic devuelve el mismo cobro (CA-10.07). */
  llaveIdempotencia: string
}

const delPunto = (puntoId: string) => `/puntos/${encodeURIComponent(puntoId)}`
const delCobro = (id: string) => `/cobros/${encodeURIComponent(id)}`

export const listarPuntos = () => http.get<Punto[]>('/puntos')

export const pagosDeCedula = (puntoId: string, cedula: string) => http.get<PagosEnPunto>(`${delPunto(puntoId)}/pagos?cedula=${encodeURIComponent(cedula)}`)

export const cobrosDelPunto = (puntoId: string, periodo: PeriodoCaja) => http.get<CobroResumen[]>(`${delPunto(puntoId)}/cobros?desde=${periodo}`)

export const cajaDelPunto = (puntoId: string, periodo: PeriodoCaja) => http.get<CajaPunto>(`${delPunto(puntoId)}/resumen?desde=${periodo}`)

export const pedirCobro = (pedido: PedidoCobro) => http.post<Cobro>('/cobros', pedido)

export const consultarCobro = (id: string) => http.get<Cobro>(delCobro(id))

/** 202 si pasa a Pagando; 422 `PinIncorrecto` con los intentos que quedan; 200 con el rechazo al tercer error. */
export const confirmarConPin = (id: string, pin: string) => http.post<Cobro>(`${delCobro(id)}/confirmar`, { pin })

export const cancelarCobro = (id: string) => http.post<Cobro>(`${delCobro(id)}/cancelar`)

/** HU-27: reenviar a facturación una venta pendiente; una ya enviada vuelve tal cual (no se duplica). */
export const reenviarVenta = (id: string) => http.post<Venta>(`/ventas/${encodeURIComponent(id)}/reenviar`)
