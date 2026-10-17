// La caja del punto (GET /puntos/:id/resumen): lo entregado, lo reembolsado, lo que va en camino y
// en cuánto tiempo le pagan al punto. Nunca gira plata por adelantado.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { crearEntorno, type Entorno } from '../pruebas/entorno.ts'
import { ANA, escenarioDeCobro, JORGE, llaveNueva, LUIS, type Escenario } from '../pruebas/escenario.ts'

let e: Entorno
let s: Escenario

beforeAll(async () => {
  e = await crearEntorno()
})
afterAll(() => e.cerrar())
beforeEach(async () => {
  await e.limpiar()
  s = await escenarioDeCobro(e)
})

const COP = { assetCode: 'COP', assetScale: 2 }
const pesos = (valor: string) => ({ valor, ...COP })
const DIA_MS = 86_400_000

const caja = async (desde?: string, puntoId = s.puntoId) => (await e.pedir('GET', `/puntos/${puntoId}/resumen${desde ? `?desde=${desde}` : ''}`)).cuerpo

/** Un retiro en el punto, confirmado con el PIN; espera a que termine el pago en segundo plano. */
async function retiroPagado(persona: { cedula: string; pin: string }, puntoId = s.puntoId) {
  const c = (await e.pedir('POST', '/cobros', { cedula: persona.cedula, canal: 'retiro', puntoId, llaveIdempotencia: llaveNueva() })).cuerpo
  await e.pedir('POST', `/cobros/${c.id}/confirmar`, { pin: persona.pin })
  await e.esperarPagos()
  return c.id as string
}

describe('caja del punto', () => {
  it('sin cobros: nada entregado, nada en camino y sin tiempo de reembolso', async () => {
    expect(await caja()).toEqual({
      punto: { id: s.puntoId, nombre: 'Tienda Marta', direccion: 'Sin dirección', billetera: 'https://ilp.interledger-test.dev/tatu-punto1', tipo: 'retiro' },
      periodo: 'hoy',
      totales: [],
      cobros: { pagados: 0, enCurso: 0, rechazados: 0 },
      reembolsoSegundos: null,
    })
  })

  it('lo entregado es lo reembolsado: el punto solo entrega al ver «Pagado», y nunca gira por adelantado', async () => {
    await retiroPagado(JORGE)
    await retiroPagado(ANA)
    const r = await caja()
    expect(r.totales).toEqual([{ entregado: pesos('46000000'), reembolsado: pesos('46000000'), pendiente: pesos('0'), giradoPorAdelantado: pesos('0') }])
    expect(r.cobros).toEqual({ pagados: 2, enCurso: 0, rechazados: 0 })
    expect(r.reembolsoSegundos).toBeGreaterThanOrEqual(0)
  })

  it('un cobro Pagando va como pendiente y en curso, no como entregado', async () => {
    e.pagos.completarSalientes = false
    await retiroPagado(JORGE)
    expect((await e.repos.cobros.dePunto(s.puntoId))[0]!.estado).toBe('Pagando')
    const r = await caja()
    expect(r.totales).toEqual([{ entregado: pesos('0'), reembolsado: pesos('0'), pendiente: pesos('23000000'), giradoPorAdelantado: pesos('0') }])
    expect(r.cobros).toEqual({ pagados: 0, enCurso: 1, rechazados: 0 })
    expect(r.reembolsoSegundos).toBeNull()
  })

  it('cuenta lo que espera el PIN como en curso y lo cancelado o fallido como rechazado', async () => {
    const pendiente = (await e.pedir('POST', '/cobros', { cedula: JORGE.cedula, canal: 'retiro', puntoId: s.puntoId, llaveIdempotencia: llaveNueva() })).cuerpo
    const cancelado = (await e.pedir('POST', '/cobros', { cedula: ANA.cedula, canal: 'retiro', puntoId: s.puntoId, llaveIdempotencia: llaveNueva() })).cuerpo
    await e.pedir('POST', `/cobros/${cancelado.id}/cancelar`)
    // El banco rechaza el tercero por el tope (RN-09): Fallido, sin plata entregada
    e.pagos.tope = 0
    await retiroPagado(LUIS)
    const r = await caja()
    expect(pendiente.estado).toBe('PorConfirmar')
    expect(r.cobros).toEqual({ pagados: 0, enCurso: 1, rechazados: 2 })
    expect(r.totales).toEqual([])
  })

  it('cada punto ve solo su caja', async () => {
    await retiroPagado(JORGE)
    await retiroPagado(ANA, s.punto2Id)
    expect((await caja()).cobros.pagados).toBe(1)
    expect((await caja(undefined, s.punto2Id)).totales[0].entregado).toEqual(pesos('23000000'))
  })

  it('el periodo: hoy (en Bogotá), los últimos 7 días o todo; uno desconocido es hoy', async () => {
    await retiroPagado(JORGE)
    e.avanzarReloj(2 * DIA_MS)
    expect((await caja('hoy')).cobros.pagados).toBe(0)
    expect((await caja('7d')).cobros.pagados).toBe(1)
    expect((await caja('xyz')).periodo).toBe('hoy')
    e.avanzarReloj(6 * DIA_MS)
    expect((await caja('7d')).cobros.pagados).toBe(0)
    expect(await caja('todo')).toMatchObject({ periodo: 'todo', cobros: { pagados: 1 } })
  })

  it('un punto que no existe es 404 PuntoNoEncontrado', async () => {
    const r = await e.pedir('GET', '/puntos/00000000-0000-4000-8000-000000000000/resumen')
    expect(r.status).toBe(404)
    expect(r.cuerpo.error.codigo).toBe('PuntoNoEncontrado')
  })
})
