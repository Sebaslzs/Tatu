// Dos procesos (instancias de Vercel que atienden las consultas del mismo cobro) intentan pagarlo a la
// vez. Debe salir un solo pago saliente, y el pago entrante guardado no se sobrescribe.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { crearEntorno, type Entorno } from '../pruebas/entorno.ts'
import { escenarioDeCobro, JORGE, llaveNueva, type Escenario } from '../pruebas/escenario.ts'
import type { Candado } from '../programas/candados.ts'
import { MovimientosCobro } from './movimientos.ts'
import { PagadorCobros } from './pagador.ts'

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

/** Un cobro de retiro ya en Pagando, sin que nadie haya empezado a pagarlo. */
async function cobroEnPagando(): Promise<string> {
  const pedido = await e.pedir('POST', '/cobros', { documento: JORGE.documento, canal: 'retiro', puntoId: s.puntoId, llaveIdempotencia: llaveNueva() })
  const movimientos = new MovimientosCobro(e.contenedor.uow)
  await movimientos.mover(await movimientos.exigir(pedido.cuerpo.id), 'Pagando')
  return pedido.cuerpo.id as string
}

/** Otro proceso de Tatú sobre la misma base. */
function proceso(candado?: Candado) {
  return new PagadorCobros({
    uow: e.contenedor.uow,
    movimientos: new MovimientosCobro(e.contenedor.uow),
    pagos: e.pagos,
    token: e.contenedor.token,
    ...(candado ? { candado } : {}),
  })
}

/** Como pg_try_advisory_lock: quien llega segundo no espera, recibe undefined. */
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

const cobro = async (id: string) => (await e.repos.cobros.obtener(id))!

describe('dos procesos pagan el mismo cobro', () => {
  beforeEach(() => {
    // El pago entrante tarda: los dos procesos alcanzan a empezar antes de que uno guarde
    e.pagos.alCrearEntrante = () => new Promise((listo) => setTimeout(listo, 30))
  })

  it('con el candado de la base: un solo pago entrante y un solo saliente', async () => {
    const id = await cobroEnPagando()
    const candado = candadoCompartido()
    const [a, b] = [proceso(candado), proceso(candado)]
    a.disparar(id)
    b.disparar(id)
    await Promise.all([a.esperar(), b.esperar()])
    expect(e.pagos.entrantes).toHaveLength(1)
    expect(e.pagos.salientes).toHaveLength(1)
    expect((await cobro(id)).estado).toBe('Pagado')
  })

  it('sin candado, el guardado condicional evita el doble pago y no sobrescribe el entrante', async () => {
    const id = await cobroEnPagando()
    const [a, b] = [proceso(), proceso()]
    a.disparar(id)
    b.disparar(id)
    await Promise.all([a.esperar(), b.esperar()])
    // Los dos alcanzaron a crear su pago entrante, pero solo uno lo guardó y pagó
    expect(e.pagos.salientes).toHaveLength(1)
    const c = await cobro(id)
    expect(c.estado).toBe('Pagado')
    expect(e.pagos.salientes[0]!.urlPagoEntrante).toBe(c.urlPagoEntrante)
  })

  it('el proceso que pierde no marca el cobro Fallido', async () => {
    const id = await cobroEnPagando()
    const [a, b] = [proceso(), proceso()]
    a.disparar(id)
    b.disparar(id)
    await Promise.all([a.esperar(), b.esperar()])
    const eventos = await e.repos.eventos.de('cobro', id)
    expect(eventos.some((ev) => ev.estadoNuevo === 'Fallido')).toBe(false)
  })
})
