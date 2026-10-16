// La documentación es verdadera: el documento es válido, cada ruta documentada existe y las
// respuestas reales cumplen los modelos publicados (sin campos de más, p. ej. tokens).
import vm from 'node:vm'
import SwaggerParser from '@apidevtools/swagger-parser'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { COP } from '../pruebas/billeterasFalsas.ts'
import { crearEntorno, type Entorno } from '../pruebas/entorno.ts'
import { construirDocumentoOpenApi } from './documento.ts'
import { RUTA_DOCUMENTO } from './rutas.ts'
import { ConfigPublica, Entidad, ErrorApi, Pago, Programa, PuntoRegistrado, Punto, ResumenLiquidacion, Resumen, Salud } from './modelos.ts'

const BILLETERA = 'https://ilp.interledger-test.dev/tatu-programa'
const PUNTO = 'https://ilp.interledger-test.dev/tatu-punto1'

type Documento = ReturnType<typeof construirDocumentoOpenApi> & {
  paths: Record<string, Record<string, { operationId?: string; summary?: string; description?: string; tags?: string[]; requestBody?: unknown; responses: Record<string, unknown> }>>
  components: { schemas: Record<string, { properties?: Record<string, unknown> }> }
}

const documento = construirDocumentoOpenApi() as Documento
const METODOS = ['get', 'post', 'patch', 'put', 'delete']

let e: Entorno
let programaId: string

beforeAll(async () => {
  e = await crearEntorno()
})
afterAll(() => e.cerrar())
beforeEach(async () => {
  await e.limpiar()
  e.billeteras.registrar(BILLETERA, COP)
  e.billeteras.registrar(PUNTO, COP)
  const entidad = await e.crearEntidad()
  programaId = (
    await e.pedir('POST', '/programas', { entidadId: entidad.id, nombre: 'Subsidio de transporte', billetera: BILLETERA, vigenciaInicio: '2026-10-01', vigenciaFin: '2026-12-31' })
  ).cuerpo.id
})

describe('el documento OpenAPI', () => {
  it('es un OpenAPI 3.1 válido, con todas sus referencias resueltas', async () => {
    const copia = structuredClone(documento)
    await expect(SwaggerParser.validate(copia as never)).resolves.toBeDefined()
  })

  it('cada operación tiene id único, resumen, descripción o etiqueta, y respuestas', () => {
    const ids = new Set<string>()
    for (const [ruta, item] of Object.entries(documento.paths)) {
      for (const metodo of METODOS.filter((m) => item[m])) {
        const op = item[metodo]!
        const donde = `${metodo.toUpperCase()} ${ruta}`
        expect(op.operationId, donde).toBeTruthy()
        expect(ids.has(op.operationId!), `operationId repetido: ${donde}`).toBe(false)
        ids.add(op.operationId!)
        expect(op.summary, donde).toBeTruthy()
        expect(op.tags?.length, donde).toBeGreaterThan(0)
        expect(Object.keys(op.responses).length, donde).toBeGreaterThan(0)
      }
    }
  })

  it('las operaciones de la épica 1 citan sus criterios de aceptación', () => {
    const texto = (ruta: string, metodo: string) => {
      const op = documento.paths[ruta]![metodo]!
      return `${op.summary} ${op.description}`
    }
    for (const ca of ['CA-01.01', 'CA-01.02', 'CA-01.03', 'CA-01.04', 'CA-01.05', 'CA-01.07']) expect(texto('/programas', 'post')).toContain(ca)
    expect(texto('/programas', 'get')).toContain('CA-01.08')
    expect(texto('/programas/{id}', 'patch')).toContain('CA-01.06')
    expect(texto('/programas/{id}/liquidacion', 'get')).toContain('CA-02.01')
    for (const ca of ['CA-03.01', 'CA-03.02', 'CA-03.03', 'CA-03.04']) expect(texto('/puntos', 'post')).toContain(ca)
    for (const ca of ['CA-02.02', 'CA-02.03', 'CA-02.04']) expect(texto('/liquidacion/programas/{programaId}/pagos/{cedula}', 'get')).toContain(ca)
  })

  it('el cuerpo de entrada sale de la validación real (billetera, vigencia y categorías documentadas)', () => {
    const cuerpo = documento.paths['/programas']!.post!.requestBody as { content: Record<string, { schema: { properties: Record<string, { description?: string; maxItems?: number }>; required: string[] } }> }
    const { properties, required } = cuerpo.content['application/json']!.schema
    expect(required).toEqual(expect.arrayContaining(['entidadId', 'nombre', 'billetera', 'vigenciaInicio', 'vigenciaFin']))
    expect(required).not.toContain('tipo')
    expect(properties.categorias!.maxItems).toBe(10)
    for (const [campo, schema] of Object.entries(properties)) expect(schema.description, `descripción de ${campo}`).toBeTruthy()
    expect(properties).not.toHaveProperty('assetCode')
  })

  it('no expone campos secretos en ningún modelo', () => {
    const secretos = /token|nonce|urlGestion|url_gestion|password|pin\b|llave/i
    for (const [nombre, modelo] of Object.entries(documento.components.schemas)) {
      for (const campo of Object.keys(modelo.properties ?? {})) expect(campo, `${nombre}.${campo}`).not.toMatch(secretos)
    }
  })
})

describe('Swagger UI', () => {
  it('GET /api/openapi.json entrega el documento', async () => {
    const { status, cuerpo } = await e.pedir('GET', '/openapi.json')
    expect(status).toBe(200)
    expect(cuerpo.openapi).toBe('3.1.0')
    expect(Object.keys(cuerpo.paths)).toEqual(Object.keys(documento.paths))
  })

  it('GET /api/docs sirve la interfaz', async () => {
    const res = await fetch(`${e.url}/docs/`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(await res.text()).toContain('swagger-ui')
  })

  it('el script de arranque de la interfaz es JavaScript válido y apunta al documento', async () => {
    const res = await fetch(`${e.url}/docs/swagger-ui-init.js`)
    expect(res.status).toBe(200)
    const script = await res.text()
    // Regresión: incrustar el documento rompía el script por «$`» dentro de los textos
    expect(() => new vm.Script(script)).not.toThrow()
    expect(script).toContain(RUTA_DOCUMENTO)
  })

  it('los textos del documento pueden llevar patrones especiales de replace sin romper nada', () => {
    expect(JSON.stringify(documento)).toContain('`$`')
    expect(() => JSON.parse(JSON.stringify(documento))).not.toThrow()
  })
})

describe('contrato: las respuestas reales cumplen lo documentado', () => {
  it('GET /salud y /config', async () => {
    expect(Salud.parse((await e.pedir('GET', '/salud')).cuerpo)).toBeTruthy()
    expect(ConfigPublica.parse((await e.pedir('GET', '/config')).cuerpo)).toBeTruthy()
  })

  it('GET /entidades', async () => {
    const { cuerpo } = await e.pedir('GET', '/entidades')
    expect(cuerpo.length).toBeGreaterThan(0)
    for (const x of cuerpo) Entidad.parse(x)
  })

  it('POST, GET y PATCH /programas devuelven un Programa sin campos de más', async () => {
    Programa.parse((await e.pedir('GET', `/programas/${programaId}`)).cuerpo)
    for (const p of (await e.pedir('GET', '/programas')).cuerpo) Programa.parse(p)
    Programa.parse((await e.pedir('PATCH', `/programas/${programaId}`, { nombre: 'Otro nombre', montoPorPersona: '100' })).cuerpo)
  })

  it('un bono también cumple el modelo (con categorías)', async () => {
    const { cuerpo: entidades } = await e.pedir('GET', '/entidades')
    const { cuerpo } = await e.pedir('POST', '/programas', {
      entidadId: entidades[0].id,
      nombre: 'Bono escolar',
      billetera: BILLETERA,
      vigenciaInicio: '2026-10-01',
      vigenciaFin: '2026-12-31',
      tipo: 'bono',
      categorias: ['educacion'],
    })
    expect(Programa.parse(cuerpo)).toMatchObject({ tipo: 'bono', canales: ['compra'] })
  })

  it('un programa con permiso activo no filtra tokens ni URL de gestión', async () => {
    await e.repos.programas.actualizar(
      programaId,
      { estado: 'Activo', topeTotal: 69_000_000, tokenAcceso: 'secreto', urlGestion: 'https://auth.example/manage', nonceCliente: 'n1' },
      'Borrador',
    )
    expect(Programa.parse((await e.pedir('GET', `/programas/${programaId}`)).cuerpo)).toMatchObject({ permisoActivo: true })
  })

  it('GET /programas/{id}/liquidacion', async () => {
    ResumenLiquidacion.parse((await e.pedir('GET', `/programas/${programaId}/liquidacion`)).cuerpo)
  })

  it('POST y GET /puntos', async () => {
    PuntoRegistrado.parse((await e.pedir('POST', '/puntos', { nombre: 'Droguería El Centro', billetera: PUNTO })).cuerpo)
    for (const p of (await e.pedir('GET', '/puntos')).cuerpo) Punto.parse(p)
  })

  it('el simulador de la liquidación', async () => {
    Resumen.parse((await e.pedir('GET', `/liquidacion/programas/${programaId}/resumen`)).cuerpo)
    Pago.parse((await e.pedir('GET', `/liquidacion/programas/${programaId}/pagos/1000000001`)).cuerpo)
    e.simulador.marcarPagada(programaId, '1000000001')
    expect(Pago.parse((await e.pedir('GET', `/liquidacion/programas/${programaId}/pagos/1000000001`)).cuerpo)).toMatchObject({ disponible: false, monto: null })
  })

  it.each([
    ['400', () => e.pedir('POST', '/programas', { nombre: 'x' }), 400],
    ['404 programa', () => e.pedir('GET', '/programas/00000000-0000-4000-8000-000000000000'), 404],
    ['404 billetera', () => e.pedir('POST', '/puntos', { nombre: 'Punto X', billetera: '$ilp.interledger-test.dev/no-existe' }), 404],
    ['404 cédula', () => e.pedir('GET', `/liquidacion/programas/${programaId}/pagos/9999999999`), 404],
    ['409', () => e.pedir('POST', '/puntos', { nombre: 'Punto repetido', billetera: PUNTO }).then(() => e.pedir('POST', '/puntos', { nombre: 'Punto repetido', billetera: PUNTO })), 409],
    ['501', () => e.pedir('POST', '/cobros', {}), 501],
  ])('los errores %s usan el formato documentado', async (_caso, hacer, status) => {
    const r = await hacer()
    expect(r.status).toBe(status)
    ErrorApi.parse(r.cuerpo)
  })

  it('cada código de error documentado en una operación tiene un caso real arriba o en HU-01/02/03', () => {
    // Los códigos de estado documentados son los que la API devuelve: ninguno inventado.
    const documentados = new Set<string>()
    for (const item of Object.values(documento.paths)) {
      for (const metodo of METODOS.filter((m) => item[m])) for (const s of Object.keys(item[metodo]!.responses)) documentados.add(s)
    }
    expect([...documentados].sort()).toEqual(['200', '201', '400', '404', '409', '503'])
  })
})
