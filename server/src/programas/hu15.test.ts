// HU-15 · Ver autorizado, cobrado y lo que nunca salió; HU-17 · Cerrar el programa y revocar el
// permiso. Un bloque por criterio de aceptación.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ErrorOpenPayments } from '../comun/openPayments.ts'
import { detalleDe } from '../db/repositorios/eventos.ts'
import { crearEntorno, type Entorno } from '../pruebas/entorno.ts'
import { escenarioDeCobro, JORGE, llaveNueva, type Escenario } from '../pruebas/escenario.ts'
import { PALABRA_CIERRE } from './tablero.ts'

const NO_EXISTE = '00000000-0000-4000-8000-000000000000'

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

const tablero = () => e.pedir('GET', `/programas/${s.programaId}/tablero`)
const cerrar = (confirmacion: string) => e.pedir('POST', `/programas/${s.programaId}/cerrar`, { confirmacion })
const programa = async () => (await e.repos.programas.obtener(s.programaId))!
const ultimoEventoDeCierre = async () => {
  const eventos = await e.repos.eventos.de('programa', s.programaId)
  return eventos.find((x) => x.estadoNuevo === 'Cerrado')!
}

/** Cobra un retiro de Jorge y espera a que quede Pagado. */
async function cobroPagado(): Promise<string> {
  const c = (await e.pedir('POST', '/cobros', { documento: JORGE.documento, canal: 'retiro', puntoId: s.puntoId, llaveIdempotencia: llaveNueva() })).cuerpo
  await e.pedir('POST', `/cobros/${c.id}/confirmar`, { pin: JORGE.pin })
  await e.esperarPagos()
  return c.id
}

describe('CA-15.01 · autorizado, cobrado y noHaSalido', () => {
  it('sin cobros: el banco dice $0 gastado (fuente banco) y noHaSalido es todo el tope', async () => {
    const { status, cuerpo } = await tablero()
    expect(status).toBe(200)
    expect(cuerpo).toMatchObject({
      autorizado: '69000000',
      cobrado: '0',
      fuente: 'banco',
      noHaSalido: '69000000',
      cobrosPagados: 0,
      porCanal: { cuenta: { cobros: 0, monto: '0' }, retiro: { cobros: 0, monto: '0' }, compra: { cobros: 0, monto: '0' } },
      cobrosPagando: 0,
      rechazadosYFallidos: 0,
      giradoPorAdelantado: 0,
      cierre: null,
    })
  })

  it('con un cobro Pagado y el banco caído: cobrado es la suma de la base, en porCanal y en sinCobrar', async () => {
    e.permisos.gastadoDelPermiso = () => Promise.reject(new ErrorOpenPayments('SinRespuesta'))
    await cobroPagado()
    const { cuerpo } = await tablero()
    expect(cuerpo).toMatchObject({
      cobrado: '23000000',
      fuente: 'plataforma',
      noHaSalido: '46000000',
      cobrosPagados: 1,
      porCanal: { retiro: { cobros: 1, monto: '23000000' } },
      sinCobrar: { cedulas: 2, monto: '46000000' },
    })
  })

  it('lo que dice el banco (getGrantSpentAmounts) manda: fuente banco con el gastado del permiso', async () => {
    e.permisos.gastado = 23_000_000
    const { cuerpo } = await tablero()
    expect(cuerpo).toMatchObject({ cobrado: '23000000', fuente: 'banco', noHaSalido: '46000000' })
  })

  it('si el banco no responde, cae a la suma de la base (fuente plataforma)', async () => {
    e.permisos.gastadoDelPermiso = () => Promise.reject(new ErrorOpenPayments('SinRespuesta'))
    const { cuerpo } = await tablero()
    expect(cuerpo).toMatchObject({ cobrado: '0', fuente: 'plataforma' })
  })

  it('un programa en cualquier estado tiene tablero; uno inexistente es 404', async () => {
    await e.pedir('POST', `/programas/${s.programaId}/pausar`)
    expect((await tablero()).status).toBe(200)
    await e.pedir('POST', `/programas/${s.programaId}/reanudar`)
    expect((await tablero()).status).toBe(200)
    expect((await e.pedir('GET', `/programas/${NO_EXISTE}/tablero`)).status).toBe(404)
  })
})

describe('CA-15.02 · el tablero se puede consultar seguido', () => {
  it('reutiliza lo que dijo el banco unos segundos en vez de volver a preguntar', async () => {
    let consultasAlBanco = 0
    e.permisos.gastadoDelPermiso = () => {
      consultasAlBanco += 1
      return Promise.resolve(1_000_000)
    }
    expect((await tablero()).cuerpo.fuente).toBe('banco')
    expect((await tablero()).cuerpo).toMatchObject({ cobrado: '1000000', fuente: 'banco' })
    expect(consultasAlBanco).toBe(1)
  })
})

describe('CA-15.03 · reembolso al punto y plata girada por adelantado', () => {
  it('promedia los segundos del PIN a Pagado en los retiros y siempre muestra giradoPorAdelantado $0', async () => {
    // Los eventos se fechan con el reloj de la base: se espera un instante real entre PIN y Pagado
    e.pagos.alCrearEntrante = () => new Promise((listo) => setTimeout(listo, 200))
    await cobroPagado()
    const { cuerpo } = await tablero()
    expect(cuerpo.reembolsoSegundos).toBeGreaterThan(0)
    expect(cuerpo.giradoPorAdelantado).toBe(0)
  })

  it('sin retiros pagados no hay promedio', async () => {
    expect((await tablero()).cuerpo.reembolsoSegundos).toBeNull()
  })
})

describe('CA-15.04 · ningún token llega al navegador', () => {
  it('el tablero de un programa Activo no filtra tokens ni URL de gestión', async () => {
    const texto = JSON.stringify((await tablero()).cuerpo)
    expect(texto).not.toMatch(/token|urlGestion|nonce|manage/i)
  })
})

describe('CA-17.01 · cerrar con la palabra CERRAR', () => {
  it('revoca el permiso, deja el programa Cerrado y devuelve el tablero con el cierre', async () => {
    const { status, cuerpo } = await cerrar(PALABRA_CIERRE)
    expect(status).toBe(200)
    expect(cuerpo).toMatchObject({
      programa: { estado: 'Cerrado', permisoActivo: false },
      fuente: 'banco',
      cierre: { autorizado: '69000000', cobrado: '0', nuncaSalio: '69000000', cerradoEn: expect.any(String) },
    })
    expect(e.permisos.revocaciones).toBe(1)
    expect((await programa()).estado).toBe('Cerrado')
    expect(await ultimoEventoDeCierre()).toMatchObject({ estadoAnterior: 'Activo', estadoNuevo: 'Cerrado' })
  })

  it('acepta la palabra con espacios y en minúsculas, y también un programa Pausado', async () => {
    await e.pedir('POST', `/programas/${s.programaId}/pausar`)
    const { status, cuerpo } = await cerrar(`  ${PALABRA_CIERRE.toLowerCase()}  `)
    expect(status).toBe(200)
    expect(cuerpo.programa.estado).toBe('Cerrado')
  })

  it('sin la palabra: 400 ConfirmacionRequerida, sin tocar el programa ni revocar nada', async () => {
    for (const confirmacion of ['', 'cerrarlos', 'SI', 'CERRAR PROGRAMA']) {
      const r = await cerrar(confirmacion)
      expect(r.status).toBe(400)
      expect(r.cuerpo.error).toEqual({ codigo: 'ConfirmacionRequerida', mensaje: `Escribe ${PALABRA_CIERRE} para confirmar` })
    }
    expect((await programa()).estado).toBe('Activo')
    expect(e.permisos.revocaciones).toBe(0)
  })

  it('un programa Borrador no se cierra: 409 EstadoNoPermite', async () => {
    const entidad = await e.crearEntidad()
    const borrador = (await e.pedir('POST', '/programas', { entidadId: entidad.id, nombre: 'Subsidio nuevo', billetera: 'https://ilp.interledger-test.dev/tatu-programa', vigenciaInicio: '2026-10-01', vigenciaFin: '2026-12-31' })).cuerpo.id
    const r = await e.pedir('POST', `/programas/${borrador}/cerrar`, { confirmacion: PALABRA_CIERRE })
    expect(r.status).toBe(409)
    expect(r.cuerpo.error.codigo).toBe('EstadoNoPermite')
  })

  it('un programa inexistente con la palabra es 404', async () => {
    const r = await e.pedir('POST', `/programas/${NO_EXISTE}/cerrar`, { confirmacion: PALABRA_CIERRE })
    expect(r.status).toBe(404)
  })

  it('si el permiso ya estaba vencido en el banco, se cierra igual', async () => {
    await e.repos.programas.actualizar(s.programaId, { permisoVencidoEn: e.ahora.toISOString() }, 'Activo')
    const { status, cuerpo } = await cerrar(PALABRA_CIERRE)
    expect(status).toBe(200)
    expect(cuerpo.programa.estado).toBe('Cerrado')
    expect(e.permisos.revocaciones).toBe(0)
    expect(cuerpo.fuente).toBe('plataforma')
  })
})

describe('CA-17.02 · un programa Cerrado no recibe cobros', () => {
  it('un intento de retiro queda Rechazado con el motivo ProgramaCerrado', async () => {
    await cerrar(PALABRA_CIERRE)
    const r = await e.pedir('POST', '/cobros', { documento: JORGE.documento, canal: 'retiro', puntoId: s.puntoId, llaveIdempotencia: llaveNueva() })
    expect(r.cuerpo).toMatchObject({ estado: 'Rechazado', motivo: { codigo: 'ProgramaCerrado', mensaje: 'El programa está cerrado y ya no recibe cobros' } })
    expect(e.pagos.entrantes).toHaveLength(0)
  })
})

describe('CA-17.03 · las cifras del cierre quedan guardadas', () => {
  it('el tablero de un programa Cerrado muestra lo que se guardó al cerrar, no una lectura nueva', async () => {
    e.permisos.gastado = 23_000_000
    await cerrar(PALABRA_CIERRE)
    // El permiso ya está revocado: el tablero no puede volver a leerlo del banco
    e.permisos.gastado = 99_999_999
    const { cuerpo } = await tablero()
    expect(cuerpo).toMatchObject({
      programa: { estado: 'Cerrado' },
      fuente: 'banco',
      cierre: { autorizado: '69000000', cobrado: '23000000', nuncaSalio: '46000000' },
      giradoPorAdelantado: 0,
    })
    expect(detalleDe(await ultimoEventoDeCierre())).toMatchObject({ autorizado: 69_000_000, cobrado: 23_000_000, nuncaSalio: 46_000_000, fuente: 'banco' })
  })
})

describe('CA-17.04 · la plataforma valida la palabra antes de revocar', () => {
  it('una confirmación equivoca no llega ni al programa ni al banco', async () => {
    const r = await cerrar('cerrarlo')
    expect(r.status).toBe(400)
    expect((await programa()).estado).toBe('Activo')
    expect(e.permisos.revocaciones).toBe(0)
    expect((await e.repos.eventos.de('programa', s.programaId)).some((x) => x.estadoNuevo === 'Cerrado')).toBe(false)
  })
})

describe('CA-17.05 · no cerrar con cobros enviándose', () => {
  it('con un cobro en Pagando responde 409 CobrosEnCurso y el programa sigue abierto', async () => {
    e.pagos.completarSalientes = false
    const c = (await e.pedir('POST', '/cobros', { documento: JORGE.documento, canal: 'retiro', puntoId: s.puntoId, llaveIdempotencia: llaveNueva() })).cuerpo
    await e.pedir('POST', `/cobros/${c.id}/confirmar`, { pin: JORGE.pin })
    await e.esperarPagos()
    expect((await e.repos.cobros.obtener(c.id))!.estado).toBe('Pagando')

    const r = await cerrar(PALABRA_CIERRE)
    expect(r.status).toBe(409)
    expect(r.cuerpo.error).toEqual({ codigo: 'CobrosEnCurso', mensaje: 'Hay cobros pagándose; espera a que terminen para cerrar' })
    expect((await programa()).estado).toBe('Activo')
    expect(e.permisos.revocaciones).toBe(0)
  })
})
