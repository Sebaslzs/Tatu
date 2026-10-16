// Utilidades compartidas: billeteras, montos y fechas.
import { describe, expect, it } from 'vitest'
import { normalizarBilletera } from './billeteras.ts'
import { finDelDia, inicioDelDia } from './fechas.ts'
import { desdeDecimal } from './montos.ts'

describe('normalizarBilletera', () => {
  it.each([
    ['$ilp.interledger-test.dev/ana', 'https://ilp.interledger-test.dev/ana'],
    ['https://ilp.interledger-test.dev/ana/', 'https://ilp.interledger-test.dev/ana'],
    ['HTTPS://ilp.interledger-test.dev/ana', 'https://ilp.interledger-test.dev/ana'],
  ])('%s → %s', (entrada, salida) => {
    expect(normalizarBilletera(entrada)).toBe(salida)
  })

  it.each(['http://ilp.example/ana', 'ilp.example/ana', 'https://ilp.example/ana?x=1'])('rechaza %s', (entrada) => {
    expect(() => normalizarBilletera(entrada)).toThrow()
  })
})

describe('desdeDecimal', () => {
  it.each([
    ['230000', 2, 23_000_000],
    ['60.5', 2, 6050],
    ['0.01', 2, 1],
    ['100', 0, 100],
  ])('%s con escala %i → %i', (texto, escala, unidades) => {
    expect(desdeDecimal(texto, escala)).toBe(unidades)
  })

  it.each([['1.234', 2], ['1.000.000', 2], ['-5', 2], ['abc', 2]])('rechaza %s', (texto, escala) => {
    expect(() => desdeDecimal(texto, escala)).toThrow()
  })
})

describe('vigencia en Bogotá', () => {
  it('un día va de las 00:00 a las 23:59:59.999 hora de Bogotá', () => {
    expect(inicioDelDia('2026-12-31').toISOString()).toBe('2026-12-31T05:00:00.000Z')
    expect(finDelDia('2026-12-31').toISOString()).toBe('2027-01-01T04:59:59.999Z')
  })

  it('un instante ISO se respeta', () => {
    expect(inicioDelDia('2026-10-16T10:00:00Z').toISOString()).toBe('2026-10-16T10:00:00.000Z')
  })
})
