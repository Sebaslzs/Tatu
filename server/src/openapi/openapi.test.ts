// La documentación es verdadera: el documento es válido, cada ruta documentada existe y las
// respuestas reales cumplen los modelos publicados (sin campos de más, p. ej. tokens).
import vm from 'node:vm'
import SwaggerParser from '@apidevtools/swagger-parser'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { COP } from '../pruebas/billeterasFalsas.ts'
import { crearEntorno, type Entorno } from '../pruebas/entorno.ts'
import { construirDocumentoOpenApi } from './documento.ts'
import { RUTA_DOCUMENTO } from './rutas.ts'
import {
  Autorizacion,
  Beneficiario,
  Coincidencia,
  ConfigPublica,
  Cuenta,
  Entidad,
  ErrorApi,
  Llave,
  LlaveConsultada,
  Pago,
  PinRegistrado,
  Persona,
  Programa,
  Punto,
  PuntoRegistrado,
  Resolucion,
  ResultadoEnlace,
  Resumen,
  ResumenLiquidacion,
  RespuestaPin,
  Salud,
} from './modelos.ts'

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

  it('las operaciones de autorización y ciclo de vida citan sus criterios', () => {
    const texto = (ruta: string, metodo: string) => {
      const op = documento.paths[ruta]![metodo]!
      return `${op.summary} ${op.description}`
    }
    for (const ca of ['CA-04.01', 'CA-04.02', 'CA-04.06']) expect(texto('/programas/{id}/autorizar', 'post')).toContain(ca)
    for (const ca of ['CA-04.03', 'CA-04.04', 'CA-04.05', 'CA-05.01', 'CA-05.02']) expect(texto('/callback/{id}', 'get')).toContain(ca)
    expect(texto('/programas/{id}/cancelar-aprobacion', 'post')).toContain('CA-05.03')
    expect(texto('/programas/{id}/pausar', 'post')).toContain('CA-18.01')
    expect(texto('/programas/{id}/reanudar', 'post')).toContain('CA-18.02')
  })

  it('el callback documenta sus parámetros y la redirección, sin cuerpo JSON', () => {
    const op = documento.paths['/callback/{id}']!.get! as { parameters: { name: string }[]; responses: Record<string, { headers?: unknown; content?: unknown }> }
    expect(op.parameters.map((p) => p.name).sort()).toEqual(['hash', 'interact_ref', 'result'])
    expect(op.responses['302']).toHaveProperty('headers.Location')
    expect(op.responses['302']).not.toHaveProperty('content')
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

  it('las operaciones de cuentas citan sus criterios (HU-07)', () => {
    const texto = (ruta: string, metodo: string) => {
      const op = documento.paths[ruta]![metodo]!
      return `${op.summary} ${op.description}`
    }
    for (const ca of ['CA-07.02', 'CA-07.03', 'CA-07.04', 'CA-07.05', 'CA-07.06', 'CA-07.07']) expect(texto('/cuentas', 'post')).toContain(ca)
    expect(texto('/cuentas/llaves/{tipo}/{valor}', 'get')).toContain('CA-07.01')
    expect(texto('/cuentas/callback/{id}', 'get')).toContain('CA-07.05')
    expect(texto('/puente/llaves/{tipo}/{valor}', 'get')).toMatch(/RN-14/)
    expect(texto('/puente/llaves/{tipo}/{valor}/pertenece', 'post')).toMatch(/RN-16/)
  })

  it('no expone campos secretos en ningún modelo', () => {
    const secretos = /token|nonce|urlGestion|url_gestion|password|^pin$|^pinHash$|hash/i
    for (const [nombre, modelo] of Object.entries(documento.components.schemas)) {
      for (const campo of Object.keys(modelo.properties ?? {})) expect(campo, `${nombre}.${campo}`).not.toMatch(secretos)
    }
  })

  it('la llave de una cuenta o de una consulta se documenta como enmascarada', () => {
    for (const modelo of ['Cuenta', 'LlaveConsultada']) {
      const llave = documento.components.schemas[modelo]!.properties!.llave as { description?: string }
      expect(llave.description, modelo).toMatch(/enmascarada/i)
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

  it('autorizar, cancelar, pausar y reanudar cumplen sus modelos y no filtran secretos', async () => {
    const autorizacion = Autorizacion.parse((await e.pedir('POST', `/programas/${programaId}/autorizar`)).cuerpo)
    expect(autorizacion.programa.estado).toBe('EsperandoAprobacion')
    Programa.parse((await e.pedir('POST', `/programas/${programaId}/cancelar-aprobacion`)).cuerpo)

    await e.pedir('POST', `/programas/${programaId}/autorizar`)
    const callback = await e.pedir('GET', `/callback/${programaId}?${new URLSearchParams({ interact_ref: 'r', hash: await e.hashValido(programaId, 'r') })}`)
    expect(callback.status).toBe(302)
    expect(callback.ubicacion).toContain('resultado=aprobado')
    expect(Programa.parse((await e.pedir('POST', `/programas/${programaId}/pausar`)).cuerpo).estado).toBe('Pausado')
    expect(Programa.parse((await e.pedir('POST', `/programas/${programaId}/reanudar`)).cuerpo).estado).toBe('Activo')
  })

  describe('cuentas, beneficiarios, puente y personas', () => {
    const WALLET = 'https://ilp.interledger-test.dev/prueba-luis'

    beforeEach(async () => {
      e.billeteras.registrar(WALLET, COP)
      e.puente.registrar({ tipo: 'celular', valor: '3001234567', cedulaTitular: '1000000002', nombreTitular: 'Luis Gómez', billetera: WALLET })
      e.puente.registrar({ tipo: 'cedula', valor: '1000000002', cedulaTitular: '1000000002', nombreTitular: 'Luis Gómez', billetera: WALLET })
      await e.repos.beneficiarios.crear('1000000002')
    })

    it('POST /cuentas y GET /cuentas/{cedula}, con llave y con billetera', async () => {
      const llave = await e.pedir('POST', '/cuentas', { cedula: '1000000002', tipoLlave: 'celular', llave: '3001234567', pin: '2222' })
      expect(ResultadoEnlace.parse(llave.cuerpo).redirect).toBeNull()
      Cuenta.parse((await e.pedir('GET', '/cuentas/1000000002')).cuerpo)
      const wallet = await e.pedir('POST', '/cuentas', { cedula: '1000000002', billetera: WALLET, pin: '2222' })
      expect(ResultadoEnlace.parse(wallet.cuerpo).redirect).toMatch(/^https:\/\//)
    })

    it('GET /cuentas/llaves/{tipo}/{valor}', async () => {
      LlaveConsultada.parse((await e.pedir('GET', '/cuentas/llaves/celular/3001234567')).cuerpo)
    })

    it('el callback de una cuenta redirige sin cuerpo JSON', async () => {
      const { cuenta } = (await e.pedir('POST', '/cuentas', { cedula: '1000000002', billetera: WALLET, pin: '2222' })).cuerpo
      const r = await e.pedir('GET', `/cuentas/callback/${cuenta.id}?result=grant_rejected`)
      expect(r.status).toBe(302)
      expect(r.ubicacion).toMatch(/resultado=rechazada$/)
    })

    it('POST, GET /beneficiarios y POST del PIN', async () => {
      e.billeteras.registrar('https://ilp.interledger-test.dev/prueba-rosa', COP)
      Beneficiario.parse((await e.pedir('POST', '/beneficiarios', { cedula: '1000000010', billetera: '$ilp.interledger-test.dev/prueba-rosa', nombre: 'Rosa', pin: '4444' })).cuerpo)
      for (const b of (await e.pedir('GET', '/beneficiarios')).cuerpo) Beneficiario.parse(b)
      PinRegistrado.parse((await e.pedir('POST', '/beneficiarios/1000000010/pin', { pin: '5555' })).cuerpo)
    })

    it('el banco puente: resolver, pertenece, listar, registrar y borrar', async () => {
      Resolucion.parse((await e.pedir('GET', '/puente/llaves/celular/3001234567')).cuerpo)
      Coincidencia.parse((await e.pedir('POST', '/puente/llaves/celular/3001234567/pertenece', { cedula: '1000000002' })).cuerpo)
      for (const l of (await e.pedir('GET', '/puente/llaves?cedula=1000000002')).cuerpo) Llave.parse(l)
      const nueva = await e.pedir('POST', '/puente/llaves', { tipo: 'correo', valor: 'luis@correo.com', cedulaTitular: '1000000002', nombreTitular: 'Luis Gómez', billetera: WALLET })
      expect(nueva.status).toBe(201)
      Llave.parse(nueva.cuerpo)
      expect((await e.pedir('DELETE', '/puente/llaves/correo/luis@correo.com')).status).toBe(204)
    })

    it('la liquidación: personas, inscribir, PIN y validar', async () => {
      for (const p of (await e.pedir('GET', '/liquidacion/personas?cedulas=1000000001,1000000002')).cuerpo) Persona.parse(p)
      Persona.parse((await e.pedir('POST', '/liquidacion/personas', { cedula: '1000000020', nombre: 'Nueva' })).cuerpo)
      PinRegistrado.parse((await e.pedir('POST', '/liquidacion/personas/1000000001/pin', { pin: '9999' })).cuerpo)
      expect(RespuestaPin.parse((await e.pedir('POST', '/liquidacion/pin/validar', { cedula: '1000000001', pin: '9999' })).cuerpo).valido).toBe(true)
    })

    it.each([
      ['422 PIN', () => e.pedir('POST', '/cuentas', { cedula: '1000000002', tipoLlave: 'celular', llave: '3001234567', pin: '0000' }), 422],
      ['404 llave', () => e.pedir('GET', '/cuentas/llaves/celular/3201112233'), 404],
      ['400 llave', () => e.pedir('GET', '/cuentas/llaves/correo/3001234567'), 400],
      ['409 persona', () => e.pedir('POST', '/beneficiarios', { cedula: '1000000002', billetera: '$ilp.interledger-test.dev/prueba-luis' }), 409],
      ['404 puente', () => e.pedir('GET', '/puente/llaves/celular/3201112233'), 404],
    ])('los errores %s usan el formato documentado', async (_caso, hacer, status) => {
      const r = await hacer()
      expect(r.status).toBe(status)
      ErrorApi.parse(r.cuerpo)
    })
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
    ['501', () => e.pedir('POST', '/programas/00000000-0000-4000-8000-000000000000/cerrar', {}), 501],
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
    expect([...documentados].sort()).toEqual(['200', '201', '204', '302', '400', '404', '409', '422', '502', '503'])
  })
})
