// Wallet addresses (CA-01.02, CA-03.03): «$ilp.interledger-test.dev/ana» o «https://…/ana/» se
// guardan siempre como https://, sin `$` ni barra final.
import { z } from 'zod'
import { ErrorApi, noDisponible } from './errores.ts'
import type { Moneda } from './montos.ts'

export function normalizarBilletera(entrada: string): string {
  let texto = entrada.trim()
  if (texto.startsWith('$')) texto = `https://${texto.slice(1)}`
  if (!/^https:\/\//i.test(texto)) throw new Error('La billetera debe empezar por $ o https://')

  const url = new URL(texto)
  if (url.search || url.hash || url.username || url.password) {
    throw new Error('La billetera no lleva parámetros')
  }
  return `https://${url.host}${url.pathname}`.replace(/\/+$/, '')
}

/** Campo Zod que valida el formato y entrega la billetera ya normalizada. */
export const billeteraTexto = z
  .string()
  .trim()
  .min(3)
  .transform((valor, ctx) => {
    try {
      return normalizarBilletera(valor)
    } catch (e) {
      ctx.addIssue({ code: 'custom', message: (e as Error).message })
      return z.NEVER
    }
  })

export interface BilleteraResuelta extends Moneda {
  /** URL canónica que devuelve el servidor de la billetera, ya normalizada. */
  url: string
  nombre: string | null
}

/** Puerto hacia Open Payments para leer billeteras; lo implementa openPaymentsService.ts. */
export interface PuertoBilleteras {
  resolver(url: string): Promise<BilleteraResuelta>
}

/** Fallo al resolver: `NoEncontrada` (no existe) o `SinRespuesta` (red o servidor caído). */
export class ErrorBilletera extends Error {
  readonly tipo: 'NoEncontrada' | 'SinRespuesta'

  constructor(tipo: 'NoEncontrada' | 'SinRespuesta', mensaje: string) {
    super(mensaje)
    this.tipo = tipo
  }
}

/** Resuelve y traduce el fallo al error de la API con el mensaje de quien pregunta. */
export async function resolverBilletera(
  billeteras: PuertoBilleteras,
  url: string,
  mensajeNoEncontrada: string,
): Promise<BilleteraResuelta> {
  try {
    return await billeteras.resolver(url)
  } catch (e) {
    if (e instanceof ErrorBilletera && e.tipo === 'SinRespuesta') {
      throw noDisponible('BilleteraSinRespuesta', 'No pudimos consultar esa billetera; intenta en un momento')
    }
    throw new ErrorApi(404, 'BilleteraNoEncontrada', mensajeNoEncontrada)
  }
}
