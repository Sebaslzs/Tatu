// Reglas puras del punto de retiro / sede de comercio.
import { tipoPunto } from '../db/generado/schema.ts'
import { ErrorApi } from '../comun/errores.ts'
import type { Canal } from '../programas/reglas.ts'

export type TipoPunto = (typeof tipoPunto.enumValues)[number]
export const TIPOS_PUNTO = tipoPunto.enumValues

export const DIRECCION_POR_DEFECTO = 'Sin dirección'

/** CA-03.04: un punto de retiro no vende con bono y una sede de comercio no hace retiros. */
export function puntoAtiendeCanal(tipo: TipoPunto, canal: Canal): boolean {
  return (tipo === 'retiro' && canal === 'retiro') || (tipo === 'compra' && canal === 'compra')
}

export function exigirCanalDelPunto(tipo: TipoPunto, canal: Canal): void {
  if (!puntoAtiendeCanal(tipo, canal)) {
    const mensaje = tipo === 'retiro' ? 'Ese punto hace retiros, no compras con bono' : 'Esa sede acepta bonos, no hace retiros'
    throw new ErrorApi(400, 'PuntoNoAtiendeCanal', mensaje)
  }
}
