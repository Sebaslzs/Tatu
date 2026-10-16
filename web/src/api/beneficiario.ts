// Lo que el beneficiario consulta y pide a la API: su resumen, su cuenta y sus cobros.
import { api } from './client'

/** Valor en unidades mínimas (`valor`) con la moneda de Open Payments. */
export interface Monto {
  valor: string
  assetCode: string
  assetScale: number
}

export interface PagoPendiente {
  programa: { id: string; nombre: string; estado: string; tipo: 'subsidio' | 'bono' }
  monto: Monto
  /** Último día para cobrar (AAAA-MM-DD, hora de Bogotá). */
  vigenciaFin: string
}

export type EstadoCuenta = 'SinEnlazar' | 'PorVerificar' | 'Verificada' | 'Rechazada'
export type TipoLlave = 'cedula' | 'celular' | 'correo' | 'alfanumerica'

export interface Cuenta {
  id: string
  estado: EstadoCuenta
  billeteraCorta: string
  tipoLlave: TipoLlave | null
  /** La llave Bre-B enmascarada; null si la cuenta es una billetera escrita a mano. */
  llave: string | null
  verificadaEn: string | null
}

export interface PuntoDeRetiro {
  id: string
  nombre: string
  direccion: string
}

export type EstadoCobro = 'Solicitado' | 'PorConfirmar' | 'Pagando' | 'Pagado' | 'Fallido' | 'Rechazado'

export interface Cobro {
  id: string
  referencia: string
  programa: { id: string; nombre: string }
  canal: 'cuenta' | 'retiro' | 'compra'
  cuenta: { billeteraCorta: string } | null
  punto: { nombre: string } | null
  monto: Monto | null
  estado: EstadoCobro
  motivo: { codigo: string; mensaje: string } | null
  segundosHastaPagado: number | null
  creado: string
  actualizado: string
}

export interface Resumen {
  persona: { nombre: string; cedula: string; tienePin: boolean }
  pagos: PagoPendiente[]
  cuenta: Cuenta | null
  puntos: PuntoDeRetiro[]
  historial: Cobro[]
}

export interface LlaveConsultada {
  tipoLlave: TipoLlave
  llave: string
  /** Nombre del titular enmascarado, para que la persona confirme que es suya. */
  titular: string
}

export interface CuentaEnlazada {
  /** Si la billetera pide aprobar el enlace, la dirección a la que hay que ir; si no, null. */
  redirect: string | null
  cuenta: Cuenta
}

export type DatosCuenta =
  | { tipoLlave: TipoLlave; llave: string; pin?: string }
  | { billetera: string; pin?: string }

export const ESTADOS_FINALES: readonly EstadoCobro[] = ['Pagado', 'Fallido', 'Rechazado']

export const obtenerResumen = (cedula: string) => api<Resumen>(`/beneficiarios/${encodeURIComponent(cedula)}/resumen`)

export const consultarLlave = (tipo: TipoLlave, valor: string) =>
  api<LlaveConsultada>(`/cuentas/llaves/${tipo}/${encodeURIComponent(valor)}`)

export const enlazarCuenta = (cedula: string, datos: DatosCuenta) =>
  api<CuentaEnlazada>('/cuentas', { method: 'POST', body: JSON.stringify({ cedula, ...datos }) })

/**
 * Pide el cobro a la cuenta de la persona. El monto lo decide la API; la llave de idempotencia hace
 * que un doble toque devuelva el mismo cobro en vez de crear otro.
 */
export const cobrarACuenta = (cedula: string, programaId: string, llaveIdempotencia: string) =>
  api<Cobro>('/cobros', { method: 'POST', body: JSON.stringify({ cedula, programaId, canal: 'cuenta', llaveIdempotencia }) })

export const consultarCobro = (id: string) => api<Cobro>(`/cobros/${encodeURIComponent(id)}`)
