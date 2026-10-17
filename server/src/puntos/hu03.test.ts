// HU-03 · Registrar puntos de retiro (CA-03.01 … CA-03.04).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { programaPunto } from '../db/generado/schema.ts'
import { COP, USD } from '../pruebas/billeterasFalsas.ts'
import { crearEntorno, type Entorno } from '../pruebas/entorno.ts'
import { exigirCanalDelPunto, puntoAtiendeCanal } from './reglas.ts'

const PUNTO = 'https://ilp.interledger-test.dev/tatu-punto1'
const PROGRAMA = 'https://ilp.interledger-test.dev/tatu-programa'

let e: Entorno

beforeAll(async () => {
  e = await crearEntorno()
})
afterAll(() => e.cerrar())
beforeEach(async () => {
  await e.limpiar()
  e.billeteras.registrar(PUNTO, COP)
  e.billeteras.registrar(PROGRAMA, COP)
})

const registrar = (extra: Record<string, unknown> = {}) =>
  e.pedir('POST', '/puntos', { nombre: 'Droguería El Centro', billetera: PUNTO, ...extra })

async function crearPrograma(): Promise<string> {
  const entidad = await e.crearEntidad()
  const r = await e.pedir('POST', '/programas', {
    entidadId: entidad.id,
    nombre: 'Subsidio de transporte',
    billetera: PROGRAMA,
    vigenciaInicio: '2026-10-01',
    vigenciaFin: '2026-12-31',
  })
  return r.cuerpo.id
}

describe('CA-03.01 · registro', () => {
  it('crea el punto con dirección y tipo retiro por defecto', async () => {
    const { status, cuerpo } = await registrar()
    expect(status).toBe(201)
    expect(cuerpo).toMatchObject({ nombre: 'Droguería El Centro', direccion: 'Sin dirección', tipo: 'retiro', billetera: PUNTO })
  })

  it('respeta la dirección y el tipo que se indiquen', async () => {
    const { cuerpo } = await registrar({ direccion: 'Calle 10 # 5-20', tipo: 'compra' })
    expect(cuerpo).toMatchObject({ direccion: 'Calle 10 # 5-20', tipo: 'compra' })
  })

  it('una dirección vacía queda «Sin dirección»', async () => {
    const { cuerpo } = await registrar({ direccion: '   ' })
    expect(cuerpo.direccion).toBe('Sin dirección')
  })

  it('con programa de la misma moneda, queda asociado al programa', async () => {
    const programaId = await crearPrograma()
    const { status, cuerpo } = await registrar({ programaId })
    expect(status).toBe(201)
    const asociados = await e.db.select().from(programaPunto)
    expect(asociados).toEqual([{ programaId, puntoId: cuerpo.id }])
  })

  it('con programa de otra moneda: 409 MonedaDistinta y no se guarda', async () => {
    const programaId = await crearPrograma()
    e.billeteras.registrar(PUNTO, USD)
    const { status, cuerpo } = await registrar({ programaId })
    expect(status).toBe(409)
    expect(cuerpo.error.codigo).toBe('MonedaDistinta')
    expect(await e.contar('punto')).toBe(0)
  })

  it('con un programa inexistente: 404', async () => {
    const { status } = await registrar({ programaId: '00000000-0000-4000-8000-000000000000' })
    expect(status).toBe(404)
  })

  it('el listado muestra los puntos registrados', async () => {
    await registrar()
    const { cuerpo } = await e.pedir('GET', '/puntos')
    expect(cuerpo).toHaveLength(1)
    expect(cuerpo[0]).toMatchObject({ nombre: 'Droguería El Centro', tipo: 'retiro' })
  })
})

describe('CA-03.02 · la billetera se resuelve', () => {
  it('si no resuelve: 404 BilleteraNoEncontrada «No encontramos esa billetera del punto»', async () => {
    const { status, cuerpo } = await registrar({ billetera: '$ilp.interledger-test.dev/no-existe' })
    expect(status).toBe(404)
    expect(cuerpo.error).toEqual({ codigo: 'BilleteraNoEncontrada', mensaje: 'No encontramos esa billetera del punto' })
    expect(await e.contar('punto')).toBe(0)
  })

  it('devuelve la moneda real de la billetera del punto', async () => {
    const { cuerpo } = await registrar()
    expect(cuerpo.moneda).toEqual({ assetCode: 'COP', assetScale: 2 })
  })
})

describe('CA-03.03 · normalización y duplicados', () => {
  it('«$…/» se guarda como https:// sin barra final', async () => {
    const { cuerpo } = await registrar({ billetera: '$ilp.interledger-test.dev/tatu-punto1/' })
    expect(cuerpo.billetera).toBe(PUNTO)
  })

  it('la misma billetera escrita distinto es un duplicado: 409 PuntoExiste', async () => {
    await registrar()
    const { status, cuerpo } = await registrar({ nombre: 'Otro punto', billetera: '$ilp.interledger-test.dev/tatu-punto1/' })
    expect(status).toBe(409)
    expect(cuerpo.error.codigo).toBe('PuntoExiste')
    expect(await e.contar('punto')).toBe(1)
  })
})

describe('CA-03.04 · canal del punto', () => {
  it.each([
    ['retiro', 'retiro', true],
    ['retiro', 'compra', false],
    ['compra', 'compra', true],
    ['compra', 'retiro', false],
    ['retiro', 'cuenta', false],
  ] as const)('punto %s con canal %s → %s', (tipo, canal, atiende) => {
    expect(puntoAtiendeCanal(tipo, canal)).toBe(atiende)
  })

  it('pedir una compra a un punto de retiro es 400 PuntoNoAtiendeCanal', () => {
    expect(() => exigirCanalDelPunto('retiro', 'compra')).toThrowError(expect.objectContaining({ status: 400, codigo: 'PuntoNoAtiendeCanal' }))
    expect(() => exigirCanalDelPunto('compra', 'retiro')).toThrowError(expect.objectContaining({ codigo: 'PuntoNoAtiendeCanal' }))
  })

  it.todo('POST /cobros aplica la regla al solicitar en un punto (HU-10, HU-21)')
})

describe('GET /puntos y pagos en caja', () => {
  it('sin puntos registrados el listado es vacío', async () => {
    const { status, cuerpo } = await e.pedir('GET', '/puntos')
    expect({ status, cuerpo }).toEqual({ status: 200, cuerpo: [] })
  })

  it('rechaza un tipo que no es retiro ni compra', async () => {
    expect((await registrar({ tipo: 'cuenta' })).status).toBe(400)
  })

  it('GET /puntos/:id/pagos: punto inexistente 404; cédula inválida 400', async () => {
    const puntoId = (await registrar()).cuerpo.id
    expect((await e.pedir('GET', `/puntos/00000000-0000-4000-8000-000000000000/pagos?documento=1000000001`)).status).toBe(404)
    expect((await e.pedir('GET', `/puntos/${puntoId}/pagos?documento=ab%24`)).status).toBe(400)
    expect((await e.pedir('GET', `/puntos/${puntoId}/pagos?documento=1000000077`)).status).toBe(404)
  })
})
