// Fechas de vigencia: un día «2026-12-31» se interpreta completo en Bogotá (UTC−5, sin horario de
// verano); un instante ISO se respeta tal cual.
import { z } from 'zod'

const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/
const BOGOTA_UTC_HORAS = 5

function partes(dia: string): [number, number, number] {
  return dia.split('-').map(Number) as [number, number, number]
}

export function inicioDelDia(valor: string): Date {
  if (!SOLO_FECHA.test(valor)) return new Date(valor)
  const [a, m, d] = partes(valor)
  return new Date(Date.UTC(a, m - 1, d, BOGOTA_UTC_HORAS))
}

export function finDelDia(valor: string): Date {
  if (!SOLO_FECHA.test(valor)) return new Date(valor)
  const [a, m, d] = partes(valor)
  return new Date(Date.UTC(a, m - 1, d + 1, BOGOTA_UTC_HORAS) - 1)
}

/** El día del calendario en Bogotá de un instante: «2026-12-31». */
export function diaEnBogota(instante: string | Date): string {
  return new Date(new Date(instante).getTime() - BOGOTA_UTC_HORAS * 3600_000).toISOString().slice(0, 10)
}

/** El inicio del día de hoy en Bogotá, como instante UTC. */
export function inicioDeHoyEnBogota(ahora: Date): Date {
  return inicioDelDia(diaEnBogota(ahora))
}

export const fechaTexto = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'fecha inválida (usa AAAA-MM-DD o ISO 8601)')

/** Una función que da la hora actual; se inyecta para poder probar vencimientos. */
export type Reloj = () => Date
export const relojDelSistema: Reloj = () => new Date()
