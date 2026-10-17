import type { CobroResumen } from '@/api/tipos'

export function personaTexto(c: Pick<CobroResumen, 'persona'>): string {
  return c.persona.nombre + (c.persona.novedad ? ' · novedad' : '')
}

export const AVISO_TABLERO =
  'El tablero en vivo (GET /programas/:id/tablero) todavía no está en la API: por ahora ves el tope del programa; lo cobrado y los cobros aparecen cuando esté.'
