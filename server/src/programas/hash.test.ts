import { describe, expect, it } from 'vitest'
import { calcularHash, hashValido } from './hash.ts'

const datos = {
  nonceCliente: 'nonce-cliente',
  nonceServidor: 'nonce-servidor',
  interactRef: 'ref-123',
  grantUrl: 'https://auth.interledger-test.dev/',
}

describe('hash del callback (HU-04)', () => {
  it('acepta las variantes base64 del hash correcto', () => {
    const h = calcularHash(datos)
    expect(hashValido(datos, h.toString('base64'))).toBe(true)
    expect(hashValido(datos, h.toString('base64').replace(/=+$/, ''))).toBe(true)
    expect(hashValido(datos, h.toString('base64url'))).toBe(true)
  })

  it('hash alterado → rechazado (RNF-01)', () => {
    const alterado = calcularHash({ ...datos, interactRef: 'ref-falso' }).toString('base64')
    expect(hashValido(datos, alterado)).toBe(false)
  })
})
