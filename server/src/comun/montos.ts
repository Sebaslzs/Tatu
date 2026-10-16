// Montos: entero en unidades mínimas + assetCode + assetScale ($230.000,00 COP = "23000000").

export interface Moneda {
  assetCode: string
  assetScale: number
}

/** Moneda tal como la muestra la API (Endpoints.md): `{ codigo, escala }`. */
export interface MonedaApi {
  codigo: string
  escala: number
}

export const monedaApi = (m: Moneda): MonedaApi => ({ codigo: m.assetCode, escala: m.assetScale })

/** Lo que viaja en JSON: unidades mínimas como texto (no pierde precisión); la moneda va aparte. */
export type Monto = string

export const monto = (valor: number): Monto => String(valor)

export const montoOpcional = (valor: number | null): Monto | null => (valor === null ? null : monto(valor))

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
