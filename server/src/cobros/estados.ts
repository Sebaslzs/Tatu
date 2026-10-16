// Máquina de estados pura del cobro (Arquitectura § 2.2): sin red ni base de datos.
// Antes de Pagando no se ha movido dinero; después no hay rollback (HU-12).

export const ESTADOS_COBRO = [
  'Solicitado',
  'PorConfirmar',
  'Pagando',
  'Pagado',
  'Fallido',
  'Rechazado',
] as const

export type EstadoCobro = (typeof ESTADOS_COBRO)[number]

const TRANSICIONES: Record<EstadoCobro, readonly EstadoCobro[]> = {
  // Canal retiro pasa a PorConfirmar (espera PIN); canal cuenta paga sin PIN (HU-09)
  Solicitado: ['PorConfirmar', 'Pagando', 'Rechazado'],
  // PIN correcto → Pagando; 3 PIN errados, vencimiento o cancelar → Rechazado (HU-11)
  PorConfirmar: ['Pagando', 'Rechazado'],
  // Solo Pagado si el pago se completó (RN-10); InsufficientGrant u otro error → Fallido
  Pagando: ['Pagado', 'Fallido'],
  Pagado: [],
  Fallido: [],
  Rechazado: [],
}

export function puedeTransicionar(desde: EstadoCobro, hacia: EstadoCobro): boolean {
  return TRANSICIONES[desde].includes(hacia)
}

export function transicionar(desde: EstadoCobro, hacia: EstadoCobro): EstadoCobro {
  if (!puedeTransicionar(desde, hacia)) {
    throw new Error(`Transición inválida del cobro: ${desde} → ${hacia}`)
  }
  return hacia
}

/** Estados que bloquean la cédula en el índice único parcial (RN-02). */
export const ESTADOS_ACTIVOS: readonly EstadoCobro[] = ['Solicitado', 'PorConfirmar', 'Pagando', 'Pagado']
