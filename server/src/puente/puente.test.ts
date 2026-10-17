// Banco puente de Bre-B simulado: contrato, enmascarado, router y cliente (RN-14 a RN-18).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { crearEntorno, type Entorno } from '../pruebas/entorno.ts'
import { ClientePuente, LlaveRechazada, PuenteNoResponde } from './cliente.ts'
import { normalizarLlave, type Llave } from './contrato.ts'
import { enmascararLlave, enmascararNombre } from './enmascarar.ts'

const WALLET = 'https://ilp.interledger-test.dev/prueba-luis'
const LLAVE: Llave = { tipo: 'celular', valor: '3001234567', documentoTitular: '1000000002', nombreTitular: 'Luis Gómez', billetera: WALLET }

describe('normalizarLlave (RN-14: el tipo lo elige la persona)', () => {
  it.each([
    ['cedula', '1.000.000-002', '1000000002'],
    ['celular', '+57 300 123-4567', '3001234567'],
    ['celular', '(300) 123 4567', '3001234567'],
    ['correo', '  Luis@Correo.COM ', 'luis@correo.com'],
    ['alfanumerica', 'LuisG', '@luisg'],
    ['alfanumerica', '@luisg', '@luisg'],
  ] as const)('%s «%s» → «%s»', (tipo, entrada, salida) => {
    expect(normalizarLlave(tipo, entrada)).toBe(salida)
  })

  it.each([
    ['celular', '2001234567'],
    ['celular', '30012345'],
    ['correo', 'sin-arroba'],
    ['alfanumerica', '@a'],
    ['cedula', 'ab'],
  ] as const)('%s «%s» no es una llave de ese tipo', (tipo, entrada) => {
    expect(normalizarLlave(tipo, entrada)).toBeNull()
  })
})

describe('enmascarar', () => {
  it.each([
    ['Ana María Rojas', 'Ana M*** R***'],
    ['Luis Gómez', 'Luis G***'],
    ['Madonna', 'Madonna'],
  ])('el nombre «%s» → «%s»', (nombre, salida) => {
    expect(enmascararNombre(nombre)).toBe(salida)
  })

  it.each([
    ['cedula', '1000000002', '******0002'],
    ['celular', '3001234567', '300***4567'],
    ['correo', 'luis@correo.com', 'l***@correo.com'],
    ['alfanumerica', '@luisgomez', '@lui***'],
  ] as const)('la llave %s «%s» → «%s»', (tipo, valor, salida) => {
    expect(enmascararLlave(tipo, valor)).toBe(salida)
  })
})

describe('router del banco puente', () => {
  let e: Entorno
  beforeAll(async () => {
    e = await crearEntorno()
  })
  afterAll(() => e.cerrar())
  beforeEach(() => e.limpiar())

  it('registra una llave (201), la actualiza si es de la misma persona (200) y rechaza la de otra (409)', async () => {
    expect((await e.pedir('POST', '/puente/llaves', LLAVE)).status).toBe(201)
    expect((await e.pedir('POST', '/puente/llaves', { ...LLAVE, billetera: 'https://ilp.interledger-test.dev/otra' })).status).toBe(200)
    const ajena = await e.pedir('POST', '/puente/llaves', { ...LLAVE, documentoTitular: '1000000003' })
    expect(ajena.status).toBe(409)
    expect(ajena.cuerpo.error.codigo).toBe('LlaveEnUso')
  })

  it('una llave tipo cédula solo la registra su titular (422)', async () => {
    const r = await e.pedir('POST', '/puente/llaves', { ...LLAVE, tipo: 'cedula', valor: '1000000003' })
    expect(r.status).toBe(422)
    expect(r.cuerpo.error.codigo).toBe('CedulaAjena')
  })

  it('un valor que no es de ese tipo: 400', async () => {
    expect((await e.pedir('POST', '/puente/llaves', { ...LLAVE, valor: '123' })).status).toBe(400)
  })

  it('resuelve a la billetera y al titular enmascarado, sin revelar su cédula', async () => {
    e.puente.registrar(LLAVE)
    const { status, cuerpo } = await e.pedir('GET', '/puente/llaves/celular/3001234567')
    expect(status).toBe(200)
    expect(cuerpo).toEqual({ tipo: 'celular', valor: '3001234567', billetera: WALLET, titular: 'Luis G***' })
  })

  it('«¿es de esta cédula?» responde sí o no sin decir de quién es', async () => {
    e.puente.registrar(LLAVE)
    expect((await e.pedir('POST', '/puente/llaves/celular/3001234567/pertenece', { documento: '1000000002' })).cuerpo).toEqual({ pertenece: true })
    expect((await e.pedir('POST', '/puente/llaves/celular/3001234567/pertenece', { documento: '1000000003' })).cuerpo).toEqual({ pertenece: false })
  })

  it('una llave que no existe, o con un tipo inválido, es 404 LlaveNoExiste', async () => {
    for (const ruta of ['/puente/llaves/celular/3001234567', '/puente/llaves/placa/ABC123', '/puente/llaves/celular/abc']) {
      const r = await e.pedir('GET', ruta)
      expect(r.status).toBe(404)
      expect(r.cuerpo.error.codigo).toBe('LlaveNoExiste')
    }
  })

  it('lista las llaves de una cédula y borra una', async () => {
    e.puente.registrar(LLAVE)
    expect((await e.pedir('GET', '/puente/llaves?documento=1000000002')).cuerpo).toEqual([LLAVE])
    expect((await e.pedir('GET', '/puente/llaves')).status).toBe(400)
    expect((await e.pedir('DELETE', '/puente/llaves/celular/3001234567')).status).toBe(204)
    expect((await e.pedir('DELETE', '/puente/llaves/celular/3001234567')).status).toBe(404)
  })
})

describe('cliente del banco puente', () => {
  const respuesta = (status: number, cuerpo?: unknown) => vi.fn().mockResolvedValue(new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), { status }))
  const cliente = (fetch: typeof globalThis.fetch) => new ClientePuente({ baseUrl: 'http://puente.invalid/', timeoutMs: 500, fetch })

  it('resolverLlave: la resolución, o null si no existe', async () => {
    const r = { tipo: 'celular', valor: '3001234567', billetera: WALLET, titular: 'Luis G***' }
    expect(await cliente(respuesta(200, r)).resolverLlave('celular', '3001234567')).toEqual(r)
    expect(await cliente(respuesta(404, { error: {} })).resolverLlave('celular', '3001234567')).toBeNull()
  })

  it('pertenece: true o false, o null si la llave no existe', async () => {
    expect(await cliente(respuesta(200, { pertenece: true })).pertenece('celular', '3001234567', '1')).toBe(true)
    expect(await cliente(respuesta(404, {})).pertenece('celular', '3001234567', '1')).toBeNull()
  })

  it('registrarLlave traduce un rechazo del banco a LlaveRechazada', async () => {
    const rechazo = respuesta(409, { error: { codigo: 'LlaveEnUso', mensaje: 'Esa llave ya es de otra persona' } })
    await expect(cliente(rechazo).registrarLlave(LLAVE)).rejects.toBeInstanceOf(LlaveRechazada)
  })

  it.each([
    ['un 503', () => respuesta(503, {})],
    ['un error de red', () => vi.fn().mockRejectedValue(new TypeError('fetch failed'))],
    ['una respuesta fuera de contrato', () => respuesta(200, { tipo: 'celular' })],
  ])('%s es PuenteNoResponde', async (_caso, fetchFalso) => {
    await expect(cliente(fetchFalso()).resolverLlave('celular', '3001234567')).rejects.toBeInstanceOf(PuenteNoResponde)
  })

  it('borrarLlave: true si existía, false si no', async () => {
    expect(await cliente(respuesta(204)).borrarLlave('celular', '3001234567')).toBe(true)
    expect(await cliente(respuesta(404, {})).borrarLlave('celular', '3001234567')).toBe(false)
  })
})
