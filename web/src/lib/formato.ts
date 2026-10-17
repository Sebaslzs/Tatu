// Formatos para mostrar montos, fechas y horas en español de Colombia.
import type { Monto } from '@/api/beneficiario'

const ZONA = 'America/Bogota'

/** "$230.000" o "$1.250,50": el valor viene en unidades mínimas según `assetScale`. */
export function formatearMonto(m: Monto): string {
  const escala = Math.max(0, m.assetScale)
  const valor = BigInt(m.valor)
  const divisor = 10n ** BigInt(escala)
  const enteros = valor / divisor
  const resto = valor % divisor
  const textoEnteros = enteros.toLocaleString('es-CO')
  if (escala === 0 || resto === 0n) return `$${textoEnteros}`
  return `$${textoEnteros},${resto.toString().padStart(escala, '0')}`
}

/** "31 de octubre" a partir de una fecha AAAA-MM-DD. */
export function formatearDiaMes(fecha: string): string {
  const [a, m, d] = fecha.slice(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(a, m - 1, d)))
}

/** "10:31 a. m." de un instante ISO, en hora de Bogotá. */
export function formatearHora(instante: string): string {
  return new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: ZONA }).format(new Date(instante))
}

/** "16 oct · 10:31 a. m." de un instante ISO, en hora de Bogotá. */
export function formatearFechaHora(instante: string): string {
  const fecha = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: ZONA }).format(new Date(instante))
  return `${fecha.replace('.', '')} · ${formatearHora(instante)}`
}
