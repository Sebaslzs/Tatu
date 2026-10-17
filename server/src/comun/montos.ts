// Montos: entero en unidades mínimas + assetCode + assetScale ($230.000,00 COP = "23000000").

export interface Moneda {
  assetCode: string
  assetScale: number
}

/** Cómo lee la moneda la web ya conectada: { assetCode, assetScale }. */
export type MonedaApi = Moneda
export const monedaApi = (m: Moneda): MonedaApi => ({ assetCode: m.assetCode, assetScale: m.assetScale })

/** Cómo la nombra Endpoints.md en los campos que la web aún no consume: { codigo, escala }. */
export interface MonedaCodigo {
  codigo: string
  escala: number
}
export const monedaCodigo = (m: Moneda): MonedaCodigo => ({ codigo: m.assetCode, escala: m.assetScale })

/** Lo que viaja en JSON: el valor va como texto para no perder precisión en el cliente. */
export interface Monto extends Moneda {
  valor: string
}

export function monto(valor: number, moneda: Moneda): Monto {
  return { valor: String(valor), assetCode: moneda.assetCode, assetScale: moneda.assetScale }
}

export function montoOpcional(valor: number | null, moneda: Moneda): Monto | null {
  return valor === null ? null : monto(valor, moneda)
}

export const mismaMoneda = (a: Moneda, b: Moneda) => a.assetCode === b.assetCode && a.assetScale === b.assetScale

const DECIMAL = /^(\d+)(?:\.(\d+))?$/

/** «230000.5» en pesos → unidades mínimas con la escala dada. Lanza si el texto no es válido. */
export function desdeDecimal(texto: string, escala: number): number {
  const partes = DECIMAL.exec(texto.trim())
  if (!partes) throw new Error('El monto debe ser un número sin puntos de miles')
  const [, enteros = '0', decimales = ''] = partes
  if (decimales.length > escala) throw new Error(`El monto admite máximo ${escala} decimales`)
  const unidades = Number(enteros + decimales.padEnd(escala, '0'))
  if (!Number.isSafeInteger(unidades)) throw new Error('El monto es demasiado grande')
  return unidades
}
