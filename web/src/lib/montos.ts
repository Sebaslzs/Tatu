// Los montos llegan como texto en unidades mínimas con su moneda y escala (como en Open Payments).
// Se formatean con BigInt, nunca con float (RN-11). La web nunca calcula el monto de un cobro.
import type { Moneda, Monto } from '@/api/tipos'

function separarMiles(entero: string): string {
  return entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/**
 * formatMonto("23000000", "COP", 2) → "$230.000". COP va sin centavos cuando son cero, como en los
 * wireframes; las demás monedas, con todos sus decimales.
 */
export function formatMonto(valor: string, codigo: string, escala: number): string {
  if (!/^-?\d+$/.test(valor)) throw new Error(`Monto inválido: ${valor}`)
  const negativo = valor.startsWith('-')
  const minimo = BigInt(negativo ? valor.slice(1) : valor)
  const divisor = 10n ** BigInt(escala)
  const entero = (minimo / divisor).toString()
  const fraccion = escala > 0 ? (minimo % divisor).toString().padStart(escala, '0') : ''
  const sinCentavos = codigo === 'COP' && /^0*$/.test(fraccion)
  const cuerpo = separarMiles(entero) + (fraccion && !sinCentavos ? `,${fraccion}` : '')
  return `${negativo && minimo !== 0n ? '-' : ''}$${cuerpo}`
}

/** "$230.000" (COP) o "$60,50 USD"; "—" cuando no hay monto. */
export function textoMonto(m: Monto | null | undefined): string {
  if (!m) return '—'
  const t = formatMonto(m.valor, m.assetCode, m.assetScale)
  return m.assetCode === 'COP' ? t : `${t} ${m.assetCode}`
}

/** «1000000» con escala 2 → «10000»; «250050» → «2500.50». Para llenar un campo en pesos. */
export function aPesos(valor: string, escala: number): string {
  const minimo = BigInt(valor)
  const divisor = 10n ** BigInt(escala)
  const fraccion = escala > 0 ? (minimo % divisor).toString().padStart(escala, '0') : ''
  return `${minimo / divisor}${/[1-9]/.test(fraccion) ? `.${fraccion}` : ''}`
}

export function montoCero(moneda: Moneda): Monto {
  return { valor: '0', ...moneda }
}

/** Suma de montos de la misma moneda, sin pasar por float. */
export function sumarMontos(moneda: Moneda, montos: Array<Monto | null | undefined>): Monto {
  const total = montos.reduce((n, m) => n + BigInt(m?.valor ?? '0'), 0n)
  return { valor: total.toString(), ...moneda }
}

/** Porcentaje con un decimal, calculado con BigInt. */
export function porcentaje(parte: Monto, total: Monto): number {
  const t = BigInt(total.valor)
  if (t === 0n) return 0
  return Number((BigInt(parte.valor) * 1000n) / t) / 10
}
