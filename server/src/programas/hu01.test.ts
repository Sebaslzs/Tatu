// HU-01 · Conectar un subsidio. Un bloque por criterio de aceptación (CA-01.01 … CA-01.08).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { exigirDetalleSeguro } from '../db/repositorios/eventos.ts'
import { COP, USD } from '../pruebas/billeterasFalsas.ts'
import { crearEntorno, type Entorno } from '../pruebas/entorno.ts'
import { exigirAutorizable } from './reglas.ts'

const BILLETERA = 'https://ilp.interledger-test.dev/tatu-programa'
const DIEZ_MINUTOS = 10 * 60_000

let e: Entorno
let entidadId: string

beforeAll(async () => {
  e = await crearEntorno()
})
afterAll(() => e.cerrar())
beforeEach(async () => {
  await e.limpiar()
  e.billeteras.registrar(BILLETERA, COP)
  entidadId = (await e.crearEntidad()).id
})

const programa = (extra: Record<string, unknown> = {}) => ({
  entidadId,
  nombre: 'Subsidio de transporte',
  billetera: BILLETERA,
  vigenciaInicio: '2026-10-01',
  vigenciaFin: '2026-12-31',
  ...extra,
})

const crear = (extra: Record<string, unknown> = {}) => e.pedir('POST', '/programas', programa(extra))

/** Lleva un programa a EsperandoAprobacion como lo haría la autorización (HU-04). */
async function pedirAprobacion(id: string, hace: number) {
  const solicitada = new Date(Date.parse('2026-10-16T15:00:00.000Z') - hace).toISOString()
  await e.repos.programas.actualizar(id, { estado: 'EsperandoAprobacion', topeTotal: 69_000_000, aprobacionSolicitadaEn: solicitada }, 'Borrador')
}

describe('CA-01.01 · creación', () => {
  it('queda en Borrador, subsidio, destino libre y canales cuenta y retiro', async () => {
    const { status, cuerpo } = await crear()
    expect(status).toBe(201)
    expect(cuerpo).toMatchObject({
      entidadId,
      nombre: 'Subsidio de transporte',
      tipo: 'subsidio',
      estado: 'Borrador',
      destino: 'libre',
      canales: ['cuenta', 'retiro'],
    })
  })

  it('no mueve dinero: sin tope, sin permiso y sin cobros', async () => {
    const { cuerpo } = await crear()
    expect(cuerpo).toMatchObject({ tope: null, permisoActivo: false })
    expect(await e.contar('cobro')).toBe(0)
  })

  it('exige una entidad existente', async () => {
    const { status, cuerpo } = await crear({ entidadId: '00000000-0000-4000-8000-000000000000' })
    expect(status).toBe(404)
    expect(cuerpo.error.codigo).toBe('EntidadNoEncontrada')
  })

  it.each([['nombre', 'ab'], ['entidadId', 'no-es-uuid'], ['vigenciaInicio', 'ayer']])('rechaza %s inválido con 400', async (campo, valor) => {
    const { status, cuerpo } = await crear({ [campo]: valor })
    expect(status).toBe(400)
    expect(cuerpo.error.codigo).toBe('EntradaInvalida')
  })
})

describe('CA-01.02 · normalización de la billetera', () => {
  it.each([
    ['$ilp.interledger-test.dev/tatu-programa'],
    ['https://ilp.interledger-test.dev/tatu-programa/'],
    ['  $ilp.interledger-test.dev/tatu-programa/  '],
  ])('«%s» se guarda como https:// sin $ ni barra final', async (entrada) => {
    const { status, cuerpo } = await crear({ billetera: entrada })
    expect(status).toBe(201)
    expect(cuerpo.billetera).toBe(BILLETERA)
  })

  it('si la billetera no resuelve: 404 BilleteraNoEncontrada y no se guarda', async () => {
    const { status, cuerpo } = await crear({ billetera: '$ilp.interledger-test.dev/no-existe' })
    expect(status).toBe(404)
    expect(cuerpo.error).toEqual({ codigo: 'BilleteraNoEncontrada', mensaje: 'No encontramos esa cuenta' })
    expect(await e.contar('programa')).toBe(0)
  })

  it('si el servidor de la billetera no responde: 503 y no se guarda (no es «no existe»)', async () => {
    e.billeteras.caida = true
    const { status, cuerpo } = await crear()
    expect(status).toBe(503)
    expect(cuerpo.error.codigo).toBe('BilleteraSinRespuesta')
    expect(await e.contar('programa')).toBe(0)
  })

  it('un formato que no es $ ni https:// es 400', async () => {
    const { status } = await crear({ billetera: 'ftp://ilp.interledger-test.dev/x' })
    expect(status).toBe(400)
  })
})

describe('CA-01.03 · moneda copiada de la billetera', () => {
  it('assetCode y assetScale vienen de la billetera, no del formulario', async () => {
    const usd = e.billeteras.registrar('$ilp.interledger-test.dev/tatu-usd', USD)
    const { cuerpo } = await crear({ billetera: usd, assetCode: 'COP', assetScale: 0, codigoMoneda: 'EUR' })
    expect(cuerpo.moneda).toEqual({ assetCode: 'USD', assetScale: 2 })
  })

  it('el monto por persona se guarda en unidades mínimas con la escala de la billetera', async () => {
    const { cuerpo } = await crear({ montoPorPersona: '230000' })
    expect(cuerpo.montoPorPersona).toEqual({ valor: '23000000', assetCode: 'COP', assetScale: 2 })
  })
})

describe('CA-01.04 · vigencia', () => {
  it.each([
    ['fin antes del inicio', '2026-12-31', '2026-10-01'],
    ['fin igual al inicio', '2026-10-16T10:00:00Z', '2026-10-16T10:00:00Z'],
  ])('%s → 400 EntradaInvalida', async (_caso, vigenciaInicio, vigenciaFin) => {
    const { status, cuerpo } = await crear({ vigenciaInicio, vigenciaFin })
    expect(status).toBe(400)
    expect(cuerpo.error.codigo).toBe('EntradaInvalida')
    expect(await e.contar('programa')).toBe(0)
  })

  it('un mismo día completo es una vigencia válida (de 00:00 a 23:59 en Bogotá)', async () => {
    const { status, cuerpo } = await crear({ vigenciaInicio: '2026-10-16', vigenciaFin: '2026-10-16' })
    expect(status).toBe(201)
    expect(cuerpo.vigenciaInicio).toBe('2026-10-16T05:00:00.000Z')
    expect(cuerpo.vigenciaFin).toBe('2026-10-17T04:59:59.999Z')
  })

  it('también se valida al editar, contra la vigencia guardada', async () => {
    const { cuerpo } = await crear()
    const r = await e.pedir('PATCH', `/programas/${cuerpo.id}`, { vigenciaFin: '2026-09-01' })
    expect(r.status).toBe(400)
    expect(r.cuerpo.error.codigo).toBe('EntradaInvalida')
  })
})

describe('CA-01.05 · bono (extra HU-21)', () => {
  it('tipo bono queda con destino restringido, canal compra y sus categorías', async () => {
    const { status, cuerpo } = await crear({ tipo: 'bono', categorias: ['alimentos', 'salud'] })
    expect(status).toBe(201)
    expect(cuerpo).toMatchObject({ tipo: 'bono', destino: 'restringido', canales: ['compra'], categorias: ['alimentos', 'salud'] })
  })

  it('máximo 10 categorías', async () => {
    const categorias = Array.from({ length: 11 }, (_, i) => `categoria-${i}`)
    const { status } = await crear({ tipo: 'bono', categorias })
    expect(status).toBe(400)
  })

  it('un bono sin categorías se crea, pero no se puede autorizar: 409 BonoSinCategorias', async () => {
    const { status, cuerpo } = await crear({ tipo: 'bono' })
    expect(status).toBe(201)
    expect(() => exigirAutorizable(cuerpo)).toThrowError(expect.objectContaining({ status: 409, codigo: 'BonoSinCategorias' }))
    expect(() => exigirAutorizable({ tipo: 'bono', categorias: ['alimentos'] })).not.toThrow()
    expect(() => exigirAutorizable({ tipo: 'subsidio', categorias: [] })).not.toThrow()
  })

  it('un subsidio no lleva categorías', async () => {
    const { status } = await crear({ categorias: ['alimentos'] })
    expect(status).toBe(400)
  })

  it('con EXTRA_BONO apagado, el bono se rechaza y el subsidio sigue funcionando (RNF-10)', async () => {
    const sinBono = await crearEntorno({ entorno: { EXTRA_BONO: 'false' } })
    try {
      sinBono.billeteras.registrar(BILLETERA)
      const id = (await sinBono.crearEntidad()).id
      const bono = await sinBono.pedir('POST', '/programas', { ...programa({ tipo: 'bono' }), entidadId: id })
      expect(bono.status).toBe(409)
      expect(bono.cuerpo.error.codigo).toBe('ExtraApagado')
      const subsidio = await sinBono.pedir('POST', '/programas', { ...programa(), entidadId: id })
      expect(subsidio.status).toBe(201)
    } finally {
      await sinBono.cerrar()
    }
  })
})

describe('CA-01.06 · edición', () => {
  it('en Borrador se cambia todo, incluidos montoPorPersona y categorías', async () => {
    const { cuerpo } = await crear()
    const usd = e.billeteras.registrar('$ilp.interledger-test.dev/otra', USD)
    const r = await e.pedir('PATCH', `/programas/${cuerpo.id}`, {
      nombre: 'Bono escolar',
      tipo: 'bono',
      categorias: ['educacion'],
      billetera: usd,
      montoPorPersona: '60.5',
      vigenciaFin: '2027-01-31',
    })
    expect(r.status).toBe(200)
    expect(r.cuerpo).toMatchObject({
      nombre: 'Bono escolar',
      tipo: 'bono',
      destino: 'restringido',
      categorias: ['educacion'],
      billetera: usd,
      moneda: { assetCode: 'USD', assetScale: 2 },
      montoPorPersona: { valor: '6050' },
      estado: 'Borrador',
    })
  })

  it('volver a subsidio borra las categorías', async () => {
    const { cuerpo } = await crear({ tipo: 'bono', categorias: ['alimentos'] })
    const r = await e.pedir('PATCH', `/programas/${cuerpo.id}`, { tipo: 'subsidio' })
    expect(r.cuerpo).toMatchObject({ tipo: 'subsidio', destino: 'libre', categorias: [] })
  })

  it.each(['EsperandoAprobacion', 'Activo'] as const)('fuera de Borrador (%s) responde 409 EstadoNoPermite', async (estado) => {
    const { cuerpo } = await crear()
    const campos =
      estado === 'Activo'
        ? { estado, topeTotal: 69_000_000, tokenAcceso: 'secreto', urlGestion: 'https://auth.example/manage' }
        : { estado, topeTotal: 69_000_000, aprobacionSolicitadaEn: new Date().toISOString() }
    await e.repos.programas.actualizar(cuerpo.id, campos, 'Borrador')
    const r = await e.pedir('PATCH', `/programas/${cuerpo.id}`, { nombre: 'Otro nombre' })
    expect(r.status).toBe(409)
    expect(r.cuerpo.error.codigo).toBe('EstadoNoPermite')
  })

  it('un programa inexistente es 404', async () => {
    const r = await e.pedir('PATCH', '/programas/00000000-0000-4000-8000-000000000000', { nombre: 'Nada' })
    expect(r.status).toBe(404)
  })
})

describe('CA-01.07 · evento de creación', () => {
  it('registra programa → Borrador con billetera, moneda y actor entidad', async () => {
    const { cuerpo } = await crear()
    const eventos = await e.repos.eventos.de('programa', cuerpo.id)
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({
      tipoEntidad: 'programa',
      estadoAnterior: null,
      estadoNuevo: 'Borrador',
      actor: 'entidad',
      detalle: { billetera: BILLETERA, codigoMoneda: 'COP' },
    })
  })

  it('un programa que no se guarda no deja evento', async () => {
    await crear({ billetera: '$ilp.interledger-test.dev/no-existe' })
    expect(await e.contar('evento')).toBe(0)
  })

  it.each([{ token: 'x' }, { accessToken: 'x' }, { datos: { pin: '1234' } }, { lista: [{ llavePrivada: 'x' }] }, { nonceCliente: 'x' }])(
    'nunca guarda tokens, PIN ni llaves: %j se rechaza',
    (detalle) => {
      expect(() => exigirDetalleSeguro(detalle)).toThrow()
    },
  )
})

describe('CA-01.08 · listado', () => {
  it('devuelve estado, permisoActivo, permisoVencido, tope y monto por persona', async () => {
    await crear({ montoPorPersona: '230000' })
    const { status, cuerpo } = await e.pedir('GET', '/programas')
    expect(status).toBe(200)
    expect(cuerpo).toHaveLength(1)
    expect(cuerpo[0]).toMatchObject({
      estado: 'Borrador',
      permisoActivo: false,
      permisoVencido: false,
      tope: null,
      montoPorPersona: { valor: '23000000' },
    })
  })

  it('una aprobación con más de 10 minutos vuelve a Borrador, con evento del sistema', async () => {
    const { cuerpo } = await crear()
    await pedirAprobacion(cuerpo.id, DIEZ_MINUTOS + 1)
    const lista = await e.pedir('GET', '/programas')
    expect(lista.cuerpo[0].estado).toBe('Borrador')
    const eventos = await e.repos.eventos.de('programa', cuerpo.id)
    expect(eventos.at(-1)).toMatchObject({ estadoAnterior: 'EsperandoAprobacion', estadoNuevo: 'Borrador', actor: 'sistema' })
  })

  it('una aprobación dentro de los 10 minutos sigue esperando', async () => {
    const { cuerpo } = await crear()
    await pedirAprobacion(cuerpo.id, DIEZ_MINUTOS - 1000)
    const lista = await e.pedir('GET', '/programas')
    expect(lista.cuerpo[0].estado).toBe('EsperandoAprobacion')
    expect(lista.cuerpo[0].tope).toMatchObject({ valor: '69000000' })
  })

  it('el vencimiento depende del reloj: al pasar el tiempo, vence', async () => {
    const { cuerpo } = await crear()
    await pedirAprobacion(cuerpo.id, 0)
    e.avanzarReloj(DIEZ_MINUTOS + 1)
    const leido = await e.pedir('GET', `/programas/${cuerpo.id}`)
    expect(leido.cuerpo.estado).toBe('Borrador')
  })

  it('un programa inexistente al leerlo es 404', async () => {
    expect((await e.pedir('GET', '/programas/00000000-0000-4000-8000-000000000000')).status).toBe(404)
  })

  it('refleja el permiso activo y el vencido, sin exponer tokens ni URL de gestión', async () => {
    const { cuerpo } = await crear()
    const activo = { estado: 'Activo' as const, topeTotal: 69_000_000, tokenAcceso: 'token-secreto', urlGestion: 'https://auth.example/manage/1' }
    await e.repos.programas.actualizar(cuerpo.id, activo, 'Borrador')

    let lista = await e.pedir('GET', '/programas')
    expect(lista.cuerpo[0]).toMatchObject({ estado: 'Activo', permisoActivo: true, permisoVencido: false })
    expect(JSON.stringify(lista.cuerpo)).not.toMatch(/token-secreto|manage|tokenAcceso|urlGestion/)

    await e.repos.programas.actualizar(cuerpo.id, { permisoVencidoEn: new Date().toISOString() }, 'Activo')
    lista = await e.pedir('GET', '/programas')
    expect(lista.cuerpo[0]).toMatchObject({ permisoActivo: false, permisoVencido: true })
  })
})
