import { describe, expect, it } from 'vitest'
import { ESTADOS_COBRO, puedeTransicionar, transicionar } from './estados.ts'

describe('máquina de estados del cobro', () => {
  it.each([
    ['Solicitado', 'PorConfirmar'],
    ['Solicitado', 'Pagando'],
    ['PorConfirmar', 'Pagando'],
    ['PorConfirmar', 'Rechazado'],
    ['Pagando', 'Pagado'],
    ['Pagando', 'Fallido'],
  ] as const)('permite %s → %s', (desde, hacia) => {
    expect(transicionar(desde, hacia)).toBe(hacia)
  })

  it('no hay rollback después del punto de no retorno', () => {
    expect(puedeTransicionar('Pagando', 'Rechazado')).toBe(false)
    expect(() => transicionar('Pagando', 'PorConfirmar')).toThrow()
  })

  it('los estados finales no salen', () => {
    for (const final of ['Pagado', 'Fallido', 'Rechazado'] as const) {
      for (const hacia of ESTADOS_COBRO) expect(puedeTransicionar(final, hacia)).toBe(false)
    }
  })
})
