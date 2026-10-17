// La web ya conectada manda `cedula`; Endpoints.md usa `documento`. Las rutas aceptan los dos.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { conAliasCedula } from './alias.ts'
import { crearEntorno, type Entorno } from '../pruebas/entorno.ts'
import { escenarioDeCobro, JORGE, llaveNueva, type Escenario } from '../pruebas/escenario.ts'

describe('conAliasCedula', () => {
  it('convierte cedula en documento y deja intacto lo demás', () => {
    expect(conAliasCedula({ cedula: '1000000003', canal: 'retiro' })).toEqual({ documento: '1000000003', canal: 'retiro' })
  })

  it('si llegan los dos, manda documento', () => {
    expect(conAliasCedula({ cedula: '1', documento: '2' })).toEqual({ documento: '2' })
  })

  it('no toca lo que no es un objeto', () => {
    expect(conAliasCedula(null)).toBeNull()
    expect(conAliasCedula(['x'])).toEqual(['x'])
  })
})

describe('las rutas aceptan cedula y documento', () => {
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

  it('GET /puntos/{id}/pagos?cedula= responde igual que con documento', async () => {
    const conCedula = await e.pedir('GET', `/puntos/${s.puntoId}/pagos?cedula=${JORGE.documento}`)
    const conDocumento = await e.pedir('GET', `/puntos/${s.puntoId}/pagos?documento=${JORGE.documento}`)
    expect(conCedula.status).toBe(200)
    expect(conCedula.cuerpo).toEqual(conDocumento.cuerpo)
  })

  it('POST /cobros con cedula en el cuerpo crea el cobro', async () => {
    const r = await e.pedir('POST', '/cobros', { cedula: JORGE.documento, canal: 'retiro', puntoId: s.puntoId, llaveIdempotencia: llaveNueva() })
    expect(r.status).toBe(201)
    expect(r.cuerpo.persona.cedula).toBe('******0003')
  })

  it('el resumen y la lista traen cedula además de documento', async () => {
    const resumen = (await e.pedir('GET', `/beneficiarios/${JORGE.documento}/resumen`)).cuerpo
    expect(resumen.persona).toMatchObject({ documento: JORGE.documento, cedula: JORGE.documento })
    const lista = (await e.pedir('GET', '/beneficiarios')).cuerpo
    expect(lista[0]).toMatchObject({ cedula: expect.any(String), documento: expect.any(String) })
  })
})
