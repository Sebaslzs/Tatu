// Endpoints.md: GET /billeteras/resolver y GET /beneficiarios/demo.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { COP } from '../pruebas/billeterasFalsas.ts'
import { crearEntorno, type Entorno } from '../pruebas/entorno.ts'

let e: Entorno
beforeAll(async () => {
  e = await crearEntorno()
})
afterAll(() => e.cerrar())
beforeEach(() => e.limpiar())

describe('GET /billeteras/resolver', () => {
  it('«Cuenta encontrada»: id, nombre y moneda en el formato del contrato', async () => {
    e.billeteras.registrar('https://ilp.interledger-test.dev/prueba-ana', COP)
    const r = await e.pedir('GET', `/billeteras/resolver?direccion=${encodeURIComponent('$ilp.interledger-test.dev/prueba-ana')}`)
    expect(r.status).toBe(200)
    expect(r.cuerpo).toEqual({ id: 'https://ilp.interledger-test.dev/prueba-ana', nombre: null, moneda: { codigo: 'COP', escala: 2 } })
  })

  it('400 si falta la dirección; 404 si no existe; 503 si la Test Wallet no responde', async () => {
    expect((await e.pedir('GET', '/billeteras/resolver')).status).toBe(400)
    expect((await e.pedir('GET', '/billeteras/resolver?direccion=%24ilp.interledger-test.dev%2Fno-existe')).status).toBe(404)
    e.billeteras.caida = true
    expect((await e.pedir('GET', '/billeteras/resolver?direccion=%24ilp.interledger-test.dev%2Fx')).status).toBe(503)
  })
})

describe('GET /beneficiarios/demo', () => {
  it('lista nombre, etiqueta y documento para el selector', async () => {
    await e.repos.beneficiarios.crear('1000000003')
    const { status, cuerpo } = await e.pedir('GET', '/beneficiarios/demo')
    expect(status).toBe(200)
    expect(cuerpo).toEqual([{ nombre: 'Jorge Ruiz', etiqueta: 'C.C. de prueba 3', documento: '1000000003' }])
  })
})
