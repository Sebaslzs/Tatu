// HU-06 · Una sola puerta para rotar el token. Dos procesos (instancias de Vercel, o Vercel y un
// servidor local) que rotan a la vez no pueden dar el permiso por vencido: el banco acepta la primera
// rotación y rechaza la segunda, y la segunda tiene que usar el token que guardó la primera.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ErrorOpenPayments } from '../comun/openPayments.ts'
import { crearEntorno, type Entorno } from '../pruebas/entorno.ts'
import { escenarioDeCobro, type Escenario } from '../pruebas/escenario.ts'
import type { Candado } from './candados.ts'
import { LectorProgramas } from './lector.ts'
import { ServicioPermisoToken } from './permisoToken.ts'
import { RenovacionPermisos } from './renovacion.ts'

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

const programa = async () => (await e.repos.programas.obtener(s.programaId))!
const guardarToken = (token: string) => e.repos.programas.actualizar(s.programaId, { tokenAcceso: token }, 'Activo')

/** Un proceso de Tatú aparte (otra instancia) sobre la misma base, con su propio candado. */
function otroProceso(candado?: Candado) {
  return new ServicioPermisoToken({
    uow: e.contenedor.uow,
    lector: new LectorProgramas(e.contenedor.uow),
    permisos: e.permisos,
    reloj: () => new Date(),
    esperaRotacion: { cadaMs: 10, intentos: 20 },
    ...(candado ? { candado } : {}),
  })
}

/** El banco de verdad: solo acepta rotar el token vigente; el reemplazado da 401. */
function bancoQueRechazaTokensReemplazados(inicial: string) {
  let vigente = inicial
  let n = 0
  e.permisos.rotarToken = async (args?: { token: string }) => {
    await new Promise((r) => setTimeout(r, 5))
    if (args?.token !== vigente) throw new ErrorOpenPayments('ErrorOpenPayments', 401, '401', 'invalid token')
    vigente = `token-del-banco-${++n}`
    return { token: vigente, urlGestion: `https://auth.interledger-test.dev/token/b${n}`, expiraEnSeg: 600 }
  }
  return { rotaciones: () => n }
}

/** Candado compartido como pg_try_advisory_lock: el segundo que llega no espera, recibe undefined. */
function candadoCompartido(): Candado {
  const tomados = new Set<number>()
  return async (clave, fn) => {
    if (tomados.has(clave)) return undefined
    tomados.add(clave)
    try {
      return await fn()
    } finally {
      tomados.delete(clave)
    }
  }
}

describe('rotaciones a la vez entre procesos', () => {
  it('dos procesos rotan a la vez: el banco acepta una, los dos quedan con el token nuevo y nadie marca el permiso', async () => {
    const banco = bancoQueRechazaTokensReemplazados((await programa()).tokenAcceso!)
    const candado = candadoCompartido()
    const [a, b] = await Promise.all([otroProceso(candado).rotarPermiso(s.programaId), otroProceso(candado).rotarPermiso(s.programaId)])
    expect(banco.rotaciones()).toBe(1)
    expect(a).toBe(b)
    expect((await programa()).tokenAcceso).toBe(a)
    expect((await programa()).permisoVencidoEn).toBeNull()
  })

  it('si el banco rechaza la rotación porque otro ya guardó un token nuevo, se usa ese y no se marca', async () => {
    e.permisos.rotarToken = async () => {
      await guardarToken('token-que-guardo-el-otro')
      throw new ErrorOpenPayments('ErrorOpenPayments', 401, '401', 'invalid token')
    }
    expect(await otroProceso().rotarPermiso(s.programaId)).toBe('token-que-guardo-el-otro')
    expect((await programa()).permisoVencidoEn).toBeNull()
  })

  it('con el candado ocupado por otro proceso, espera el token que ese proceso guarde', async () => {
    const ocupado: Candado = async () => undefined
    setTimeout(() => void guardarToken('token-de-la-otra-instancia'), 30)
    expect(await otroProceso(ocupado).rotarPermiso(s.programaId)).toBe('token-de-la-otra-instancia')
    expect((await programa()).permisoVencidoEn).toBeNull()
  })

  it('con el candado ocupado y sin token nuevo, se reintenta luego: el permiso no se marca', async () => {
    const ocupado: Candado = async () => undefined
    await expect(otroProceso(ocupado).rotarPermiso(s.programaId)).rejects.toMatchObject({ tipo: 'SinRespuesta' })
    expect((await programa()).permisoVencidoEn).toBeNull()
  })

  it('una muerte real del permiso (el banco rechaza el token vigente) sí lo marca vencido', async () => {
    e.permisos.errorAlRotar = new ErrorOpenPayments('ErrorOpenPayments', 400, '400', 'invalid grant')
    await expect(otroProceso().rotarPermiso(s.programaId)).rejects.toThrow('El permiso venció')
    expect((await programa()).permisoVencidoEn).not.toBeNull()
  })
})

describe('las lecturas no rotan', () => {
  it('el tablero con el token rechazado usa la suma de la base: no rota ni marca el permiso', async () => {
    e.permisos.gastadoDelPermiso = async () => {
      throw new ErrorOpenPayments('TokenVencido', 403, '403', 'Inactive Token')
    }
    const { status, cuerpo } = await e.pedir('GET', `/programas/${s.programaId}/tablero`)
    expect(status).toBe(200)
    expect(cuerpo.fuente).toBe('plataforma')
    expect(e.permisos.rotaciones).toBe(0)
    expect((await programa()).permisoVencidoEn).toBeNull()
  })
})

describe('la renovación en segundo plano', () => {
  it('si otro servidor ya está renovando (candado ocupado), esta vuelta no rota nada', async () => {
    const ocupado: Candado = async () => undefined
    const renovacion = new RenovacionPermisos({ uow: e.contenedor.uow, token: otroProceso(), candado: ocupado })
    expect(await renovacion.renovarTodos()).toEqual({ renovados: 0, vencidos: 0, fallidos: 0 })
    expect(e.permisos.rotaciones).toBe(0)
  })
})
