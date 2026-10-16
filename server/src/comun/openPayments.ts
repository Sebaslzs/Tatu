// Lo que el dominio sabe de Open Payments sin importar el SDK: los errores que le interesan y el
// formato de los montos. El adaptador (openPaymentsService.ts) traduce el SDK a esto.
import { ErrorApi } from './errores.ts'
import type { Moneda } from './montos.ts'

export type TipoErrorOP = 'TopeSuperado' | 'TokenVencido' | 'SinRespuesta' | 'ErrorOpenPayments' | 'NoConfigurado'

export class ErrorOpenPayments extends Error {
  readonly tipo: TipoErrorOP
  readonly status: number | undefined
  readonly code: string | undefined
  readonly description: string | undefined

  constructor(tipo: TipoErrorOP, status?: number, code?: string, description?: string) {
    super(`Open Payments: ${tipo}${status ? ` (${status})` : ''}${description ? ` ${description}` : ''}`)
    this.tipo = tipo
    this.status = status
    this.code = code
    this.description = description
  }
}

/** Traduce un fallo de Open Payments al error de la API que ve quien la consume. */
export function errorOpApi(e: unknown, mensaje: string): ErrorApi {
  if (e instanceof ErrorApi) return e
  if (e instanceof ErrorOpenPayments) {
    if (e.tipo === 'NoConfigurado') return new ErrorApi(503, 'OpenPaymentsNoConfigurado', e.description ?? mensaje)
    return new ErrorApi(502, 'ErrorOpenPayments', mensaje)
  }
  return new ErrorApi(500, 'ErrorInterno', mensaje)
}

/** Monto tal como lo pide Open Payments: valor en unidades mínimas, como texto. */
export interface MontoOP {
  value: string
  assetCode: string
  assetScale: number
}

export const montoOP = (valor: number, moneda: Moneda): MontoOP => ({
  value: String(valor),
  assetCode: moneda.assetCode,
  assetScale: moneda.assetScale,
})
