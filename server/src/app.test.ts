// Plataforma: salud, configuración pública y formato de errores.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { crearEntorno, type Entorno } from './pruebas/entorno.ts'

let e: Entorno

beforeAll(async () => {
  e = await crearEntorno()
})
afterAll(() => e.cerrar())

describe('API', () => {
  it('GET /api/salud responde', async () => {
    const { status, cuerpo } = await e.pedir('GET', '/salud')
    expect({ status, cuerpo }).toEqual({ status: 200, cuerpo: { estado: 'ok' } })
  })

  it('GET /api/config expone las banderas EXTRA_* (RNF-10)', async () => {
    const { cuerpo } = await e.pedir('GET', '/config')
    expect(cuerpo).toEqual({ pollIntervaloMs: 1000, extras: { bono: true, qr: false, pdf417: false, contrato: false, deploy: false } })
  })

  it('una ruta inexistente responde 404 con el formato de error', async () => {
    const { status, cuerpo } = await e.pedir('GET', '/no-existe')
    expect(status).toBe(404)
    expect(cuerpo.error.codigo).toBe('NoEncontrado')
  })

  it('un JSON mal formado es 400 EntradaInvalida', async () => {
    const res = await fetch(`${e.url}/programas`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: { codigo: string } }).error.codigo).toBe('EntradaInvalida')
  })

  it('las rutas de épicas siguientes responden 501 NoImplementado', async () => {
    const { status, cuerpo } = await e.pedir('POST', '/cobros', {})
    expect(status).toBe(501)
    expect(cuerpo.error.codigo).toBe('NoImplementado')
  })
})
