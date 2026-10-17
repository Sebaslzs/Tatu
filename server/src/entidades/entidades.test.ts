// HU-01 · GET /entidades: el selector de entidades financiadoras de la web.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { crearEntorno, type Entorno } from '../pruebas/entorno.ts'

let e: Entorno

beforeAll(async () => {
  e = await crearEntorno()
})
afterAll(() => e.cerrar())
beforeEach(() => e.limpiar())

describe('GET /entidades', () => {
  it('sin entidades registradas devuelve una lista vacía', async () => {
    const { status, cuerpo } = await e.pedir('GET', '/entidades')
    expect({ status, cuerpo }).toEqual({ status: 200, cuerpo: [] })
  })

  it('devuelve la entidad creada con id, nombre y tipo', async () => {
    const entidad = await e.crearEntidad('Alcaldía X')
    const { status, cuerpo } = await e.pedir('GET', '/entidades')
    expect({ status, cuerpo }).toEqual({ status: 200, cuerpo: [{ id: entidad.id, nombre: 'Alcaldía X', tipo: 'gobierno' }] })
  })

  it('solo lista las entidades Activas: deja fuera las Suspendidas y Retiradas', async () => {
    const activa = await e.repos.entidades.crear({ documento: '900000001', nombre: 'Caja Activa', tipo: 'caja_compensacion' })
    await e.repos.entidades.crear({ documento: '900000002', nombre: 'Caja Suspendida', tipo: 'caja_compensacion', estado: 'Suspendida' })
    await e.repos.entidades.crear({ documento: '900000003', nombre: 'Caja Retirada', tipo: 'caja_compensacion', estado: 'Retirada' })

    const { status, cuerpo } = await e.pedir('GET', '/entidades')
    expect({ status, cuerpo }).toEqual({ status: 200, cuerpo: [{ id: activa.id, nombre: 'Caja Activa', tipo: 'caja_compensacion' }] })
  })

  it('ordena por nombre', async () => {
    await e.crearEntidad('Zona Franca')
    await e.crearEntidad('Alcaldía de Bogotá')
    await e.crearEntidad('Ministerio de Trabajo')

    const { cuerpo } = await e.pedir('GET', '/entidades')
    expect(cuerpo.map((x: { nombre: string }) => x.nombre)).toEqual(['Alcaldía de Bogotá', 'Ministerio de Trabajo', 'Zona Franca'])
  })

  it('no expone el documento (NIT) ni los datos de contacto', async () => {
    await e.repos.entidades.crear({
      documento: '900123456',
      nombre: 'Alcaldía con Datos',
      tipo: 'gobierno',
      email: 'contacto@alcaldia.gov.co',
    })

    const { cuerpo } = await e.pedir('GET', '/entidades')
    expect(Object.keys(cuerpo[0]).sort()).toEqual(['id', 'nombre', 'tipo'])
    const texto = JSON.stringify(cuerpo)
    for (const privado of ['900123456', 'NIT', 'contacto@alcaldia.gov.co']) {
      expect(texto).not.toContain(privado)
    }
  })
})
