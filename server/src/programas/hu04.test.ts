// HU-04 · Aprobar el permiso con tope en el banco, HU-05 · aprobación rechazada o vencida y
// HU-18 · pausar el programa. Un bloque por criterio de aceptación.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { detalleDe, exigirDetalleSeguro } from '../db/repositorios/eventos.ts'
import { COP } from '../pruebas/billeterasFalsas.ts'
import { crearEntorno, type Entorno } from '../pruebas/entorno.ts'

const BILLETERA = 'https://ilp.interledger-test.dev/tatu-programa'
const DIEZ_MINUTOS = 10 * 60_000

let e: Entorno
let id: string

beforeAll(async () => {
  e = await crearEntorno()
})
afterAll(() => e.cerrar())
beforeEach(async () => {
  await e.limpiar()
  e.billeteras.registrar(BILLETERA, COP)
  const entidad = await e.crearEntidad()
  id = (
    await e.pedir('POST', '/programas', { entidadId: entidad.id, nombre: 'Subsidio de transporte', billetera: BILLETERA, vigenciaInicio: '2026-10-01', vigenciaFin: '2026-12-31' })
  ).cuerpo.id
})

const urlWeb = (resultado: string) => `http://localhost:5173/entidad/programas/${id}/aprobar?resultado=${resultado}`
const autorizar = () => e.pedir('POST', `/programas/${id}/autorizar`)
const programa = async () => (await e.repos.programas.obtener(id))!
const ultimoEvento = async () => (await e.repos.eventos.de('programa', id)).at(-1)!

async function callback(query: Record<string, string>) {
  return e.pedir('GET', `/callback/${id}?${new URLSearchParams(query)}`)
}

/** Autoriza y completa el callback válido: deja el programa Activo. */
async function activar() {
  await autorizar()
  await callback({ interact_ref: 'ref-1', hash: await e.hashValido(id, 'ref-1') })
}

describe('CA-04.01 · solicitud del permiso', () => {
  it('pide el permiso con el tope de la liquidación y deja el programa esperando', async () => {
    const { status, cuerpo } = await autorizar()
    expect(status).toBe(200)
    expect(cuerpo.redirect).toBe('https://auth.interledger-test.dev/interact/1')
    expect(cuerpo.programa).toMatchObject({ estado: 'EsperandoAprobacion', tope: { valor: '69000000', assetCode: 'COP', assetScale: 2 } })
    expect(e.permisos.pedidos[0]).toMatchObject({
      billetera: BILLETERA,
      tope: 69_000_000,
      moneda: { assetCode: 'COP', assetScale: 2 },
      urlRetorno: `${e.config.API_BASE_URL}/callback/${id}`,
    })
  })

  it('solo un programa en Borrador se autoriza: 409 EstadoNoPermite', async () => {
    await autorizar()
    const { status, cuerpo } = await autorizar()
    expect(status).toBe(409)
    expect(cuerpo.error.codigo).toBe('EstadoNoPermite')
    expect(e.permisos.pedidos).toHaveLength(1)
  })

  it('un bono sin categorías no se autoriza: 409 BonoSinCategorias', async () => {
    const entidad = await e.crearEntidad()
    const bono = await e.pedir('POST', '/programas', {
      entidadId: entidad.id,
      nombre: 'Bono escolar',
      billetera: BILLETERA,
      vigenciaInicio: '2026-10-01',
      vigenciaFin: '2026-12-31',
      tipo: 'bono',
    })
    const r = await e.pedir('POST', `/programas/${bono.cuerpo.id}/autorizar`)
    expect(r.status).toBe(409)
    expect(r.cuerpo.error.codigo).toBe('BonoSinCategorias')
    expect(e.permisos.pedidos).toHaveLength(0)
  })

  it('un bono con categorías sí se autoriza', async () => {
    const entidad = await e.crearEntidad()
    const bono = await e.pedir('POST', '/programas', {
      entidadId: entidad.id,
      nombre: 'Bono escolar',
      billetera: BILLETERA,
      vigenciaInicio: '2026-10-01',
      vigenciaFin: '2026-12-31',
      tipo: 'bono',
      categorias: ['educacion'],
    })
    expect((await e.pedir('POST', `/programas/${bono.cuerpo.id}/autorizar`)).status).toBe(200)
  })

  it('con una liquidación sin cédulas: 409 SinLiquidacion', async () => {
    const vacio = await crearEntorno({ liquidacion: [] })
    try {
      vacio.billeteras.registrar(BILLETERA, COP)
      const entidad = await vacio.crearEntidad()
      const p = await vacio.pedir('POST', '/programas', { entidadId: entidad.id, nombre: 'Sin nadie', billetera: BILLETERA, vigenciaInicio: '2026-10-01', vigenciaFin: '2026-12-31' })
      const r = await vacio.pedir('POST', `/programas/${p.cuerpo.id}/autorizar`)
      expect(r.status).toBe(409)
      expect(r.cuerpo.error.codigo).toBe('SinLiquidacion')
    } finally {
      await vacio.cerrar()
    }
  })

  it('si el banco no responde: 502 y el programa sigue en Borrador', async () => {
    e.permisos.falloAlPedir = true
    const { status, cuerpo } = await autorizar()
    expect(status).toBe(502)
    expect(cuerpo.error.codigo).toBe('ErrorOpenPayments')
    expect((await programa()).estado).toBe('Borrador')
  })

  it('un programa inexistente es 404', async () => {
    expect((await e.pedir('POST', '/programas/00000000-0000-4000-8000-000000000000/autorizar')).status).toBe(404)
  })
})

describe('CA-04.02 · los temporales viven solo en el backend', () => {
  it('guarda la continuación, los nonces, el grant_url y la fecha de solicitud', async () => {
    await autorizar()
    const p = await programa()
    expect(p).toMatchObject({
      estado: 'EsperandoAprobacion',
      uriContinuacion: 'https://auth.interledger-test.dev/continue/1',
      tokenContinuacion: 'token-continuacion-1',
      nonceCliente: 'nonce-cliente-de-prueba',
      nonceCierre: 'nonce-servidor-1',
      urlPermiso: 'https://auth.interledger-test.dev',
    })
    // Postgres devuelve la fecha en su formato; lo que importa es el instante
    expect(Date.parse(p.aprobacionSolicitadaEn!)).toBe(e.ahora.getTime())
  })

  it('no guarda el redirect y no filtra ningún secreto por la API', async () => {
    const { cuerpo } = await autorizar()
    const fila = JSON.stringify(await programa())
    expect(fila).not.toContain(cuerpo.redirect)
    expect(JSON.stringify(cuerpo.programa)).not.toMatch(/token|nonce|continue|manage/i)
    expect(JSON.stringify((await e.pedir('GET', `/programas/${id}`)).cuerpo)).not.toMatch(/token|nonce|continue|manage/i)
  })
})

describe('CA-04.03 · callback correcto', () => {
  it('con un hash válido: continúa el permiso, queda Activo y redirige a la web', async () => {
    await autorizar()
    const r = await callback({ interact_ref: 'ref-1', hash: await e.hashValido(id, 'ref-1') })
    expect(r.status).toBe(302)
    expect(r.ubicacion).toBe(urlWeb('aprobado'))
    expect(e.permisos.continuaciones).toEqual([{ interactRef: 'ref-1' }])
    expect(await programa()).toMatchObject({
      estado: 'Activo',
      tokenAcceso: 'token-acceso-1',
      urlGestion: 'https://auth.interledger-test.dev/token/1',
    })
  })

  it('borra los temporales y deja un evento del banco sin el token', async () => {
    await activar()
    const p = await programa()
    expect([p.nonceCliente, p.nonceCierre, p.uriContinuacion, p.tokenContinuacion, p.aprobacionSolicitadaEn]).toEqual([null, null, null, null, null])
    const evento = await ultimoEvento()
    expect(evento).toMatchObject({ estadoAnterior: 'EsperandoAprobacion', estadoNuevo: 'Activo', actor: 'banco' })
    expect(detalleDe(evento)).toMatchObject({ varianteHash: 'estandar-con-padding', expiresIn: 600 })
    expect(JSON.stringify(evento)).not.toContain('token-acceso')
  })

  it('el programa Activo muestra permisoActivo y el tope, sin exponer el token', async () => {
    await activar()
    const { cuerpo } = await e.pedir('GET', `/programas/${id}`)
    expect(cuerpo).toMatchObject({ estado: 'Activo', permisoActivo: true, permisoVencido: false, tope: { valor: '69000000' } })
    expect(JSON.stringify(cuerpo)).not.toMatch(/token|manage/i)
  })
})

describe('CA-04.04 · hash inválido', () => {
  it('no activa, deja un evento y redirige con resultado=invalido', async () => {
    await autorizar()
    const malo = (await e.hashValido(id, 'ref-1')).replace(/^./, (c) => (c === 'A' ? 'B' : 'A'))
    const r = await callback({ interact_ref: 'ref-1', hash: malo })
    expect(r.ubicacion).toBe(urlWeb('invalido'))
    expect((await programa()).estado).toBe('EsperandoAprobacion')
    expect(detalleDe(await ultimoEvento()).texto).toMatch(/hash inválido/)
    expect(e.permisos.continuaciones).toHaveLength(0)
  })

  it.each([
    ['sin hash', { interact_ref: 'ref-1' }],
    ['sin interact_ref', { hash: 'abc' }],
    ['sin nada', {}],
  ])('un callback %s es inválido', async (_caso, query) => {
    await autorizar()
    const r = await callback(query)
    expect(r.ubicacion).toBe(urlWeb('invalido'))
    expect((await programa()).estado).toBe('EsperandoAprobacion')
  })

  it('si grant.continue falla, el programa no se activa', async () => {
    await autorizar()
    e.permisos.falloAlContinuar = true
    const r = await callback({ interact_ref: 'ref-1', hash: await e.hashValido(id, 'ref-1') })
    expect(r.ubicacion).toBe(urlWeb('invalido'))
    expect((await programa()).estado).toBe('EsperandoAprobacion')
    expect(await ultimoEvento()).toMatchObject({ actor: 'banco' })
  })

  it.each([['un id inexistente', '00000000-0000-4000-8000-000000000000'], ['un id que no es UUID', 'no-es-uuid']])(
    '%s redirige a la web sin error',
    async (_caso, otro) => {
      const r = await e.pedir('GET', `/callback/${otro}?interact_ref=x&hash=y`)
      expect(r.status).toBe(302)
      expect(r.ubicacion).toBe(`${e.config.APP_BASE_URL}/entidad?resultado=invalido`)
    },
  )
})

describe('CA-04.05 · idempotencia del callback', () => {
  it('repetirlo con el programa ya Activo redirige igual y no cambia nada', async () => {
    await autorizar()
    const query = { interact_ref: 'ref-1', hash: await e.hashValido(id, 'ref-1') }
    await callback(query)
    const antes = (await e.repos.eventos.de('programa', id)).length
    const r = await callback(query)
    expect(r.ubicacion).toBe(urlWeb('aprobado'))
    expect(await e.repos.eventos.de('programa', id)).toHaveLength(antes)
    expect(e.permisos.continuaciones).toHaveLength(1)
  })

  it('dos callbacks a la vez dejan un solo programa Activo', async () => {
    await autorizar()
    const query = { interact_ref: 'ref-1', hash: await e.hashValido(id, 'ref-1') }
    const [a, b] = await Promise.all([callback(query), callback(query)])
    expect([a.ubicacion, b.ubicacion]).toEqual([urlWeb('aprobado'), urlWeb('aprobado')])
    expect((await programa()).estado).toBe('Activo')
    const activaciones = (await e.repos.eventos.de('programa', id)).filter((x) => x.estadoNuevo === 'Activo')
    expect(activaciones).toHaveLength(1)
  })
})

describe('CA-16.03 · los eventos no guardan secretos', () => {
  it('el tipo de llave no es un secreto, pero la llave sí lo sería', () => {
    expect(() => exigirDetalleSeguro({ tipoLlave: 'celular' })).not.toThrow()
    expect(() => exigirDetalleSeguro({ llave: '3001234567' })).toThrow()
    expect(() => exigirDetalleSeguro({ datos: { llavePrivada: 'x' } })).toThrow()
  })
})

describe('CA-04.06 · permiso sin receptor fijo', () => {
  it('el pedido al banco no fija un receptor: solo billetera, tope, moneda y retorno', async () => {
    await autorizar()
    expect(Object.keys(e.permisos.pedidos[0]!).sort()).toEqual(['billetera', 'moneda', 'nonce', 'tope', 'urlRetorno'])
  })
})

describe('CA-05.01 · aprobación rechazada', () => {
  it('grant_rejected vuelve a Borrador con resultado=rechazado y conserva la configuración', async () => {
    await autorizar()
    const antes = await programa()
    const r = await callback({ result: 'grant_rejected' })
    expect(r.ubicacion).toBe(urlWeb('rechazado'))
    const p = await programa()
    expect(p.estado).toBe('Borrador')
    expect(p).toMatchObject({ nombre: antes.nombre, billeteraPrograma: antes.billeteraPrograma, codigoMoneda: 'COP' })
    expect(await ultimoEvento()).toMatchObject({ estadoNuevo: 'Borrador', actor: 'banco' })
    expect(detalleDe(await ultimoEvento())).toMatchObject({ resultado: 'grant_rejected' })
  })
})

describe('CA-05.02 · aprobación inválida o vencida', () => {
  it('grant_invalid vuelve a Borrador', async () => {
    await autorizar()
    const r = await callback({ result: 'grant_invalid' })
    expect(r.ubicacion).toBe(urlWeb('rechazado'))
    expect((await programa()).estado).toBe('Borrador')
    expect(detalleDe(await ultimoEvento()).resultado).toBe('grant_invalid')
  })

  it('pasados 10 minutos, volver a la app muestra el programa en Borrador y cancela el permiso pendiente', async () => {
    await autorizar()
    e.avanzarReloj(DIEZ_MINUTOS + 1)
    expect((await e.pedir('GET', `/programas/${id}`)).cuerpo.estado).toBe('Borrador')
    expect(e.permisos.cancelaciones).toBe(1)
    expect(await ultimoEvento()).toMatchObject({ estadoNuevo: 'Borrador', actor: 'sistema' })
  })

  it('un callback tardío, después de vencer, redirige con resultado=vencido y no activa', async () => {
    await autorizar()
    const hash = await e.hashValido(id, 'ref-1')
    e.avanzarReloj(DIEZ_MINUTOS + 1)
    const r = await callback({ interact_ref: 'ref-1', hash })
    expect(r.ubicacion).toBe(urlWeb('vencido'))
    expect((await programa()).estado).toBe('Borrador')
    expect(e.permisos.continuaciones).toHaveLength(0)
  })

  it('si el banco no puede cancelar el permiso pendiente, igual vence', async () => {
    await autorizar()
    e.permisos.falloAlCancelar = true
    e.avanzarReloj(DIEZ_MINUTOS + 1)
    expect((await e.pedir('GET', `/programas/${id}`)).cuerpo.estado).toBe('Borrador')
  })
})

describe('CA-05.03 · cancelar la aprobación', () => {
  it('llama grant.cancel y vuelve a Borrador', async () => {
    await autorizar()
    const { status, cuerpo } = await e.pedir('POST', `/programas/${id}/cancelar-aprobacion`)
    expect(status).toBe(200)
    expect(cuerpo.estado).toBe('Borrador')
    expect(e.permisos.cancelaciones).toBe(1)
    expect(detalleDe(await ultimoEvento())).toMatchObject({ resultado: 'cancelado' })
  })

  it('es best-effort: si el banco falla, igual vuelve a Borrador', async () => {
    await autorizar()
    e.permisos.falloAlCancelar = true
    expect((await e.pedir('POST', `/programas/${id}/cancelar-aprobacion`)).cuerpo.estado).toBe('Borrador')
  })

  it('fuera de EsperandoAprobacion responde 409', async () => {
    const r = await e.pedir('POST', `/programas/${id}/cancelar-aprobacion`)
    expect(r.status).toBe(409)
    expect(r.cuerpo.error.codigo).toBe('EstadoNoPermite')
  })

  it('después de cancelar se puede autorizar de nuevo', async () => {
    await autorizar()
    await e.pedir('POST', `/programas/${id}/cancelar-aprobacion`)
    expect((await autorizar()).status).toBe(200)
    expect(e.permisos.pedidos).toHaveLength(2)
  })
})

describe('CA-05.04 · configuración preservada y evento con el resultado', () => {
  it.each([
    ['rechazada', () => callback({ result: 'grant_rejected' })],
    ['cancelada', () => e.pedir('POST', `/programas/${id}/cancelar-aprobacion`)],
  ])('una aprobación %s conserva el programa y deja un evento', async (_caso, accion) => {
    await autorizar()
    await accion()
    expect(await programa()).toMatchObject({ nombre: 'Subsidio de transporte', estado: 'Borrador', billeteraPrograma: BILLETERA })
    const eventos = await e.repos.eventos.de('programa', id)
    expect(eventos.map((x) => x.estadoNuevo)).toEqual(['Borrador', 'EsperandoAprobacion', 'Borrador'])
  })
})

describe('CA-18.01 · pausar', () => {
  it('un programa Activo pasa a Pausado, con su evento', async () => {
    await activar()
    const { status, cuerpo } = await e.pedir('POST', `/programas/${id}/pausar`)
    expect(status).toBe(200)
    expect(cuerpo).toMatchObject({ estado: 'Pausado', permisoActivo: true })
    expect(await ultimoEvento()).toMatchObject({ estadoAnterior: 'Activo', estadoNuevo: 'Pausado' })
    expect(e.permisos.revocaciones).toBe(0)
  })

  it.each(['Borrador', 'Pausado'] as const)('un programa %s no se pausa: 409 EstadoNoPermite', async (estado) => {
    if (estado === 'Pausado') {
      await activar()
      await e.pedir('POST', `/programas/${id}/pausar`)
    }
    const r = await e.pedir('POST', `/programas/${id}/pausar`)
    expect(r.status).toBe(409)
    expect(r.cuerpo.error.codigo).toBe('EstadoNoPermite')
  })
})

describe('CA-18.02 · reanudar', () => {
  it('un programa Pausado vuelve a Activo', async () => {
    await activar()
    await e.pedir('POST', `/programas/${id}/pausar`)
    const { status, cuerpo } = await e.pedir('POST', `/programas/${id}/reanudar`)
    expect(status).toBe(200)
    expect(cuerpo.estado).toBe('Activo')
    expect(await ultimoEvento()).toMatchObject({ estadoAnterior: 'Pausado', estadoNuevo: 'Activo' })
  })

  it('un programa Activo no se reanuda: 409', async () => {
    await activar()
    expect((await e.pedir('POST', `/programas/${id}/reanudar`)).status).toBe(409)
  })

  it('un callback repetido con el programa Pausado sigue siendo «aprobado»', async () => {
    await activar()
    await e.pedir('POST', `/programas/${id}/pausar`)
    const r = await callback({ interact_ref: 'ref-1', hash: 'x' })
    expect(r.ubicacion).toBe(urlWeb('aprobado'))
    expect((await programa()).estado).toBe('Pausado')
  })

  it.todo('los cobros que ya están en Pagando terminan normalmente (HU-12)')
})
