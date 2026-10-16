import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { candidatos, verificarHash, type DatosHash } from './hash.ts'

const datos: DatosHash = {
  nonceCliente: 'nonce-cliente',
  nonceCierre: 'nonce-servidor',
  interactRef: 'ref-123',
  urlPermiso: 'https://auth.interledger-test.dev',
}

const hashDe = (grantUrl: string) =>
  createHash('sha256').update(`nonce-cliente\nnonce-servidor\nref-123\n${grantUrl}`).digest('base64')

describe('hash del callback (CA-04.03)', () => {
  it('acepta las tres variantes base64 del hash correcto', () => {
    const crudo = hashDe('https://auth.interledger-test.dev')
    expect(verificarHash(crudo, datos)?.variante).toBe('estandar-con-padding')
    expect(verificarHash(crudo.replace(/=+$/, ''), datos)?.variante).toBe('estandar-sin-padding')
    expect(verificarHash(crudo.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), datos)).toBeTruthy()
  })

  it('acepta el grant_url con y sin barra final, y dice cuál coincidió', () => {
    expect(verificarHash(hashDe('https://auth.interledger-test.dev'), datos)?.grantUrl).toBe('https://auth.interledger-test.dev')
    expect(verificarHash(hashDe('https://auth.interledger-test.dev/'), datos)?.grantUrl).toBe('https://auth.interledger-test.dev/')
    expect(verificarHash(hashDe('https://auth.interledger-test.dev'), { ...datos, urlPermiso: 'https://auth.interledger-test.dev/' })).toBeTruthy()
  })

  it('hash alterado → rechazado (RNF-01)', () => {
    const alterado = hashDe('https://auth.interledger-test.dev').replace(/^./, (c) => (c === 'A' ? 'B' : 'A'))
    expect(verificarHash(alterado, datos)).toBeNull()
  })

  it.each([
    ['interact_ref distinto', { interactRef: 'ref-falso' }],
    ['nonce del cliente distinto', { nonceCliente: 'otro' }],
    ['nonce del servidor distinto', { nonceCierre: 'otro' }],
    ['grant_url distinto', { urlPermiso: 'https://otro.example' }],
  ])('un dato distinto (%s) no valida', (_caso, cambio) => {
    expect(verificarHash(hashDe('https://auth.interledger-test.dev'), { ...datos, ...cambio })).toBeNull()
  })

  it('un hash vacío no valida', () => {
    expect(verificarHash('', datos)).toBeNull()
  })

  it('genera 6 candidatos: 3 variantes por 2 formas de la URL', () => {
    expect(candidatos(datos)).toHaveLength(6)
  })
})
