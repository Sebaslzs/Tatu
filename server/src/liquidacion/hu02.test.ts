// HU-02 · Consultar la liquidación de la entidad (CA-02.01 … CA-02.07).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { COP } from '../pruebas/billeterasFalsas.ts'
import { crearEntorno, type Entorno } from '../pruebas/entorno.ts'
import { ClienteLiquidacion, LiquidacionNoResponde } from './cliente.ts'
import { MENSAJE_CEDULA_NO_ENCONTRADA } from './contrato.ts'

const BILLETERA = 'https://ilp.interledger-test.dev/tatu-programa'
const ANA = '1000000001'

let e: Entorno
let programaId: string
let cliente: ClienteLiquidacion

beforeAll(async () => {
  e = await crearEntorno()
  cliente = new ClienteLiquidacion({ baseUrl: `${e.url}/liquidacion`, timeoutMs: 2000 })
})
afterAll(() => e.cerrar())
beforeEach(async () => {
  await e.limpiar()
  e.billeteras.registrar(BILLETERA, COP)
  const entidad = await e.crearEntidad()
  const r = await e.pedir('POST', '/programas', {
    entidadId: entidad.id,
    nombre: 'Subsidio de transporte',
    billetera: BILLETERA,
    vigenciaInicio: '2026-10-01',
    vigenciaFin: '2026-12-31',
  })
  programaId = r.cuerpo.id
})

/** fetch falso: responde lo que el test indique, sin red. */
const fetchQueResponde = (respuesta: () => Promise<Response>) => (async () => respuesta()) as unknown as typeof fetch

describe('CA-02.01 · resumen del programa en Borrador', () => {
  it('muestra 3 cédulas y $690.000 en la moneda del programa', async () => {
    const { status, cuerpo } = await e.pedir('GET', `/programas/${programaId}/liquidacion`)
    expect(status).toBe(200)
    expect(cuerpo).toEqual({ cedulas: 3, total: { valor: '69000000', assetCode: 'COP', assetScale: 2 } })
  })

  it('un programa inexistente es 404', async () => {
    const { status } = await e.pedir('GET', '/programas/00000000-0000-4000-8000-000000000000/liquidacion')
    expect(status).toBe(404)
  })
})

describe('CA-02.02 · cédula con pago', () => {
  it('la liquidación responde disponible y el monto', async () => {
    const { status, cuerpo } = await e.pedir('GET', `/liquidacion/programas/${programaId}/pagos/${ANA}`)
    expect(status).toBe(200)
    expect(cuerpo).toEqual({ cedula: ANA, disponible: true, monto: '23000000', novedad: false })
    expect(await cliente.pago(programaId, ANA)).toEqual({ tipo: 'disponible', monto: 23_000_000, novedad: false })
  })
})

describe('CA-02.03 · cédula ya pagada', () => {
  it('responde disponible=false y monto=null', async () => {
    e.simulador.marcarPagada(programaId, ANA)
    const { status, cuerpo } = await e.pedir('GET', `/liquidacion/programas/${programaId}/pagos/${ANA}`)
    expect(status).toBe(200)
    expect(cuerpo).toEqual({ cedula: ANA, disponible: false, monto: null })
    expect(await cliente.pago(programaId, ANA)).toEqual({ tipo: 'pagado' })
  })

  it('pagada en un programa no afecta a otro', async () => {
    e.simulador.marcarPagada('otro-programa', ANA)
    expect(await cliente.pago(programaId, ANA)).toEqual({ tipo: 'disponible', monto: 23_000_000, novedad: false })
  })
})

describe('CA-02.04 · cédula inexistente', () => {
  it.each([['9999999999'], ['no-es-cedula']])('«%s» responde 404 «Esta cédula no está en la liquidación»', async (cedula) => {
    const { status, cuerpo } = await e.pedir('GET', `/liquidacion/programas/${programaId}/pagos/${cedula}`)
    expect(status).toBe(404)
    expect(cuerpo.error.mensaje).toBe(MENSAJE_CEDULA_NO_ENCONTRADA)
    expect(await cliente.pago(programaId, cedula)).toEqual({ tipo: 'noExiste' })
  })

  it.todo('el punto ve el rechazo único de HU-13 sin saber si la cédula existía (se prueba con HU-10/HU-13)')
})

describe('CA-02.05 · la plataforma no copia la lista', () => {
  it('consultar resumen y pagos no guarda beneficiarios en la base', async () => {
    await e.pedir('GET', `/programas/${programaId}/liquidacion`)
    for (const cedula of ['1000000001', '1000000002', '1000000003']) await cliente.pago(programaId, cedula)
    expect(await e.contar('beneficiario')).toBe(0)
    expect(await e.contar('cobro')).toBe(0)
  })
})

describe('CA-02.06 · la liquidación no responde', () => {
  const esNoResponde = expect.objectContaining({ status: 503, codigo: 'LiquidacionNoResponde', message: 'No pudimos consultar tu pago; intenta en un momento' })

  it.each([
    ['un 503', () => Promise.resolve(new Response('{}', { status: 503 }))],
    ['un error de red', () => Promise.reject(new TypeError('fetch failed'))],
    ['una respuesta fuera de contrato', () => Promise.resolve(Response.json({ cedulas: 'tres' }))],
  ])('%s es LiquidacionNoResponde', async (_caso, respuesta) => {
    const caida = new ClienteLiquidacion({ baseUrl: 'http://liquidacion.invalid', timeoutMs: 1000, fetch: fetchQueResponde(respuesta) })
    await expect(caida.resumen(programaId)).rejects.toBeInstanceOf(LiquidacionNoResponde)
    await expect(caida.pago(programaId, ANA)).rejects.toEqual(esNoResponde)
  })

  it('un timeout es LiquidacionNoResponde', async () => {
    const lenta = (async (_url: string, init: RequestInit) =>
      new Promise((_, rechazar) => init.signal?.addEventListener('abort', () => rechazar(init.signal?.reason)))) as unknown as typeof fetch
    const caida = new ClienteLiquidacion({ baseUrl: 'http://liquidacion.invalid', timeoutMs: 50, fetch: lenta })
    await expect(caida.pago(programaId, ANA)).rejects.toEqual(esNoResponde)
  })

  it('por la API, el resumen responde 503 LiquidacionNoResponde', async () => {
    const sinLiquidacion = await crearEntorno({ entorno: { LIQUIDACION_URL: 'http://127.0.0.1:9/api/liquidacion', LIQUIDACION_TIMEOUT_MS: '500' } })
    try {
      sinLiquidacion.billeteras.registrar(BILLETERA)
      const entidad = await sinLiquidacion.crearEntidad()
      const p = await sinLiquidacion.pedir('POST', '/programas', {
        entidadId: entidad.id,
        nombre: 'Subsidio',
        billetera: BILLETERA,
        vigenciaInicio: '2026-10-01',
        vigenciaFin: '2026-12-31',
      })
      const r = await sinLiquidacion.pedir('GET', `/programas/${p.cuerpo.id}/liquidacion`)
      expect(r.status).toBe(503)
      expect(r.cuerpo.error).toEqual({ codigo: 'LiquidacionNoResponde', mensaje: 'No pudimos consultar tu pago; intenta en un momento' })
    } finally {
      await sinLiquidacion.cerrar()
    }
  })

  it.todo('al intentar cobrar, el cobro se rechaza con LiquidacionNoResponde y queda un evento (HU-10)')
})

describe('CA-02.07 · novedad retroactiva', () => {
  it('una novedad cargada después es cobrable, pero no entra al tope que se aprobó (RN-08)', async () => {
    const antes = await cliente.resumen(programaId)
    e.simulador.cargarNovedad({ cedula: '1000000004', nombre: 'Retroactivo', monto: 46_000_000 })
    expect(await cliente.pago(programaId, '1000000004')).toEqual({ tipo: 'disponible', monto: 46_000_000, novedad: true })
    expect(await cliente.resumen(programaId)).toEqual(antes)
    expect(antes).toEqual({ cedulas: 3, total: 69_000_000 })
  })

  it('el resumen del programa tampoco cambia con la novedad: el tope fijado sigue siendo $690.000', async () => {
    e.simulador.cargarNovedad({ cedula: '1000000004', nombre: 'Retroactivo', monto: 46_000_000 })
    const { cuerpo } = await e.pedir('GET', `/programas/${programaId}/liquidacion`)
    expect(cuerpo).toEqual({ cedulas: 3, total: { valor: '69000000', assetCode: 'COP', assetScale: 2 } })
  })

  it.todo('la plataforma no frena por el tope: el banco responde InsufficientGrant y el cobro queda Fallido (HU-12)')
})
