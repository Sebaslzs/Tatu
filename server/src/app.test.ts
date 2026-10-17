// Plataforma: salud, configuración pública y formato de errores.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { RUTA_DOCUMENTO } from './openapi/rutas.ts'
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

  it.each([
    ['POST', '/programas/00000000-0000-4000-8000-000000000000/cerrar', {}],
    ['GET', '/programas/00000000-0000-4000-8000-000000000000/tablero', undefined],
  ])('%s %s responde con el formato de error', async (metodo, ruta, cuerpo) => {
    const r = await e.pedir(metodo, ruta, cuerpo)
    expect(r.status).toBe(metodo === 'POST' ? 400 : 404)
    expect(r.cuerpo.error.codigo).toBe(metodo === 'POST' ? 'ConfirmacionRequerida' : 'NoEncontrado')
  })

  it('GET /api/openapi.json publica el documento OpenAPI 3.1', async () => {
    const { status, cuerpo } = await e.pedir('GET', '/openapi.json')
    expect(status).toBe(200)
    expect(cuerpo.openapi).toBe('3.1.0')
    expect(cuerpo.info).toMatchObject({ title: 'API de Tatú', version: expect.any(String) })
    expect(cuerpo.paths['/salud'].get.operationId).toBe('salud')
  })

  it('GET /api/docs/ sirve el Swagger UI en HTML', async () => {
    const res = await fetch(`${e.url}/docs/`)
    const html = await res.text()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(html).toContain('<title>API de Tatú</title>')
    expect(html).toContain('swagger-ui')
  })

  it('GET /api/docs/swagger-ui-init.js apunta al documento por URL', async () => {
    const res = await fetch(`${e.url}/docs/swagger-ui-init.js`)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain(RUTA_DOCUMENTO)
  })

  it('GET /api/config con EXTRA_BONO=false apaga la bandera bono', async () => {
    const sinBono = await crearEntorno({ entorno: { EXTRA_BONO: 'false' } })
    try {
      const { status, cuerpo } = await sinBono.pedir('GET', '/config')
      expect({ status, cuerpo }).toEqual({
        status: 200,
        cuerpo: { pollIntervaloMs: 1000, extras: { bono: false, qr: false, pdf417: false, contrato: false, deploy: false } },
      })
    } finally {
      await sinBono.cerrar()
    }
  })

  it('GET /api/config no expone secretos ni URLs internas (RNF-10)', async () => {
    const { cuerpo } = await e.pedir('GET', '/config')
    expect(Object.keys(cuerpo).sort()).toEqual(['extras', 'pollIntervaloMs'])
    const texto = JSON.stringify(cuerpo)
    for (const interno of [e.config.LIQUIDACION_URL, e.config.PUENTE_URL, e.config.API_BASE_URL, e.config.APP_BASE_URL]) {
      expect(texto).not.toContain(interno)
    }
    expect(texto).not.toMatch(/http|token|key|secret|llave|password/i)
  })

  it('un POST a una ruta inexistente también responde 404 con el formato de error', async () => {
    const { status, cuerpo } = await e.pedir('POST', '/no-existe', {})
    expect(status).toBe(404)
    expect(cuerpo).toEqual({ error: { codigo: 'NoEncontrado', mensaje: 'No existe POST /api/no-existe' } })
  })
})
