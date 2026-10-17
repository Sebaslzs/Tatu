// Máquina de estados pura del cobro (6 estados): sin red ni base de datos. Repite la tabla del trigger
// `cobro_transicion` de la base: doble defensa, la función con pruebas y la base.
//
//   Solicitado   → PorConfirmar | Pagando | Rechazado
//   PorConfirmar → Pagando | Rechazado
//   Pagando      → Pagado | Fallido
//   Pagado, Rechazado, Fallido: finales
//
// Antes de Pagando no se ha movido dinero; después no hay rollback, solo consulta (HU-12).
import type { Canal } from '../programas/reglas.ts'

export const ESTADOS_COBRO = ['Solicitado', 'PorConfirmar', 'Pagando', 'Pagado', 'Fallido', 'Rechazado'] as const
export type EstadoCobro = (typeof ESTADOS_COBRO)[number]

const TRANSICIONES: Record<EstadoCobro, readonly EstadoCobro[]> = {
  // El canal cuenta pasa a Pagando sin PIN (la cuenta ya probó ser de la persona); retiro y compra esperan el PIN
  Solicitado: ['PorConfirmar', 'Pagando', 'Rechazado'],
  // PIN correcto → Pagando; 3 PIN errados, vencimiento o cancelar → Rechazado (HU-11)
  PorConfirmar: ['Pagando', 'Rechazado'],
  // Solo Pagado si el pago se completó (RN-10); InsufficientGrant u otro error definitivo → Fallido
  Pagando: ['Pagado', 'Fallido'],
  Pagado: [],
  Fallido: [],
  Rechazado: [],
}

/** Estados en los que un cobro cuenta para RN-02 en un bono (de un solo uso). */
export const ESTADOS_VIVOS: readonly EstadoCobro[] = ['Solicitado', 'PorConfirmar', 'Pagando', 'Pagado']

/**
 * Estados en vuelo: el cobro reserva saldo y todavía no termina. Uno solo a la vez por persona y
 * programa (índice `un_cobro_en_vuelo_por_persona`, ACTUALIZACIÓN 01).
 */
export const ESTADOS_EN_VUELO: readonly EstadoCobro[] = ['Solicitado', 'PorConfirmar', 'Pagando']

export function puedeTransicionar(desde: EstadoCobro, hacia: EstadoCobro): boolean {
  return TRANSICIONES[desde].includes(hacia)
}

export function esFinal(estado: EstadoCobro): boolean {
  return TRANSICIONES[estado].length === 0
}

/** Siguiente estado después de Solicitado según el canal. */
export function despuesDeSolicitado(canal: Canal): EstadoCobro {
  return canal === 'cuenta' ? 'Pagando' : 'PorConfirmar'
}

export class TransicionInvalida extends Error {
  constructor(desde: EstadoCobro, hacia: EstadoCobro) {
    super(`Transición de cobro no permitida: ${desde} -> ${hacia}`)
  }
}

export function transicionar(desde: EstadoCobro, hacia: EstadoCobro): EstadoCobro {
  if (!puedeTransicionar(desde, hacia)) throw new TransicionInvalida(desde, hacia)
  return hacia
}
