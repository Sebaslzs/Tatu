// Personas y PIN de la liquidación (HU-07, HU-11): la plataforma pregunta «¿es este el PIN?» y nunca
// lo recibe de vuelta; el simulador no lo guarda en claro.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { crearEntorno, type Entorno } from '../pruebas/entorno.ts'
import { ClienteLiquidacion } from './cliente.ts'
import { LiquidacionSimulada } from './simulador.ts'

let e: Entorno
let cliente: ClienteLiquidacion

beforeAll(async () => {
  e = await crearEntorno()
  cliente = new ClienteLiquidacion({ baseUrl: `${e.url}/liquidacion`, timeoutMs: 2000 })
})
afterAll(() => e.cerrar())
beforeEach(() => e.limpiar())

describe('nombres y PIN', () => {
  it('devuelve el nombre y si tiene PIN de varias cédulas; las que no están, no vienen', async () => {
    const r = await cliente.personas(['1000000001', '1000000002', '9999999999'])
    expect([...r.values()]).toEqual([
      { cedula: '1000000001', nombre: 'Ana Pérez', tienePin: true },
      { cedula: '1000000002', nombre: 'Luis Gómez', tienePin: true },
    ])
  })

  it('no devuelve el PIN ni su hash', async () => {
    const { cuerpo } = await e.pedir('GET', '/liquidacion/personas?cedulas=1000000001')
    expect(JSON.stringify(cuerpo)).not.toMatch(/1111|hash|pin"/)
  })

  it('valida el PIN correcto y rechaza el incorrecto', async () => {
    expect(await cliente.validarPin('1000000001', '1111')).toBe(true)
    expect(await cliente.validarPin('1000000001', '0000')).toBe(false)
  })

  it('una cédula sin PIN o inexistente nunca valida', async () => {
    await cliente.inscribir('1000000050', 'Sin PIN')
    expect(await cliente.validarPin('1000000050', '0000')).toBe(false)
    expect(await cliente.validarPin('9999999999', '1111')).toBe(false)
  })

  it('un pedido inválido responde «no válido» sin error', async () => {
    const { status, cuerpo } = await e.pedir('POST', '/liquidacion/pin/validar', { cedula: 'x', pin: 'abc' })
    expect(status).toBe(200)
    expect(cuerpo).toEqual({ valido: false })
  })

  it('el simulador guarda solo el hash del PIN', () => {
    const sim = new LiquidacionSimulada([{ cedula: '1000000001', nombre: 'Ana', monto: 1, pin: '1234' }])
    expect(JSON.stringify([...(sim as unknown as { personas: Map<string, unknown> }).personas.values()])).not.toContain('1234')
  })
})

describe('inscribir y cambiar el PIN', () => {
  it('inscribe a una persona nueva, con su PIN', async () => {
    const p = await cliente.inscribir('1000000051', 'Rosa Díaz', '4444')
    expect(p).toEqual({ cedula: '1000000051', nombre: 'Rosa Díaz', tienePin: true })
    expect(await cliente.validarPin('1000000051', '4444')).toBe(true)
  })

  it('es idempotente: repetirlo cambia el nombre y conserva el PIN si no llega uno', async () => {
    await cliente.inscribir('1000000051', 'Rosa Díaz', '4444')
    const p = await cliente.inscribir('1000000051', 'Rosa D.')
    expect(p).toMatchObject({ nombre: 'Rosa D.', tienePin: true })
    expect(await cliente.validarPin('1000000051', '4444')).toBe(true)
  })

  it('pone o cambia el PIN; false si la cédula no está', async () => {
    expect(await cliente.ponerPin('1000000001', '9999')).toBe(true)
    expect(await cliente.validarPin('1000000001', '9999')).toBe(true)
    expect(await cliente.validarPin('1000000001', '1111')).toBe(false)
    expect(await cliente.ponerPin('9999999999', '9999')).toBe(false)
  })

  it('una persona inscrita después entra al total solo si no es novedad', async () => {
    await cliente.inscribir('1000000052', 'Nueva')
    expect(await cliente.resumen('p')).toEqual({ cedulas: 4, total: 92_000_000 })
  })

  it.each([
    ['una cédula inválida', '/liquidacion/personas', { cedula: 'x', nombre: 'A' }],
    ['un nombre vacío', '/liquidacion/personas', { cedula: '1000000053', nombre: '' }],
    ['un PIN de 3 dígitos', '/liquidacion/personas/1000000001/pin', { pin: '123' }],
  ])('%s es 400', async (_caso, ruta, cuerpo) => {
    expect((await e.pedir('POST', ruta, cuerpo)).status).toBe(400)
  })

  it('consultar más de 500 cédulas o una inválida es 400', async () => {
    expect((await e.pedir('GET', '/liquidacion/personas?cedulas=abc')).status).toBe(400)
  })
})
