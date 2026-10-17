// Biometría simulada en el punto: el retiro se confirma con rostro o huella, sin PIN. Pagar a la
// cuenta no pide nada. La API solo registra el método: nunca una foto ni una huella.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { crearEntorno, type Entorno } from '../pruebas/entorno.ts'
import { ANA, escenarioDeCobro, JORGE, llaveNueva, type Escenario } from '../pruebas/escenario.ts'

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

const retiro = async (cedula = JORGE.cedula) =>
  (await e.pedir('POST', '/cobros', { cedula, canal: 'retiro', puntoId: s.puntoId, llaveIdempotencia: llaveNueva() })).cuerpo
const confirmar = (id: string, cuerpo: unknown) => e.pedir('POST', `/cobros/${id}/confirmar`, cuerpo)

describe('confirmar con rostro o huella', () => {
  it.each(['rostro', 'huella'])('con %s pasa a Pagando (202), paga y termina Pagado', async (metodo) => {
    const c = await retiro()
    const r = await confirmar(c.id, { metodo })
    expect(r.status).toBe(202)
    expect(r.cuerpo.estado).toBe('Pagando')
    await e.esperarPagos()
    expect((await e.pedir('GET', `/cobros/${c.id}`)).cuerpo.estado).toBe('Pagado')
  })

  it('el evento guarda solo el método de verificación', async () => {
    const c = await retiro()
    await confirmar(c.id, { metodo: 'huella' })
    const eventos = await e.repos.eventos.de('cobro', c.id)
    const pagando = eventos.find((ev) => ev.estadoNuevo === 'Pagando')
    expect(pagando?.detalle).toMatchObject({ verificacion: 'huella' })
    expect(JSON.stringify(eventos)).not.toMatch(/foto|imagen|plantilla/i)
  })

  it('no cuenta intentos ni bloquea: no hay PIN que fallar', async () => {
    const c = await retiro()
    expect((await confirmar(c.id, { metodo: 'rostro' })).status).toBe(202)
    expect(await e.contar('bloqueo_pin')).toBe(0)
  })

  it('confirmar dos veces seguidas no paga dos veces', async () => {
    const c = await retiro()
    expect((await confirmar(c.id, { metodo: 'huella' })).status).toBe(202)
    expect((await confirmar(c.id, { metodo: 'huella' })).status).toBe(200)
    await e.esperarPagos()
    expect(e.pagos.salientes).toHaveLength(1)
  })

  it('pasados los 120 s el cobro ya está Rechazado y no se paga', async () => {
    const c = await retiro()
    e.avanzarReloj(121_000)
    const r = await confirmar(c.id, { metodo: 'rostro' })
    expect(r.status).toBe(200)
    expect(r.cuerpo).toMatchObject({ estado: 'Rechazado', motivo: { codigo: 'TiempoAgotado' } })
  })

  it.each([
    ['un método desconocido', { metodo: 'iris' }],
    ['PIN y método a la vez', { pin: '3333', metodo: 'huella' }],
    ['un cuerpo vacío', {}],
  ])('%s es 400', async (_caso, cuerpo) => {
    const c = await retiro()
    expect((await confirmar(c.id, cuerpo)).status).toBe(400)
  })

  it('el PIN sigue sirviendo (compras con bono)', async () => {
    const c = await retiro()
    expect((await confirmar(c.id, { pin: JORGE.pin })).status).toBe(202)
  })
})

describe('el retiro ya no exige PIN registrado', () => {
  it('una persona sin PIN puede pedir un retiro y confirmarlo con huella', async () => {
    e.simulador.inscribir('1000000009', 'Rosa Díaz')
    await e.repos.beneficiarios.crear('1000000009')
    const c = await retiro('1000000009')
    expect(c.estado).toBe('PorConfirmar')
    expect((await confirmar(c.id, { metodo: 'huella' })).status).toBe(202)
  })

  it('cobrar a la cuenta sigue sin pedir verificación', async () => {
    const r = await e.pedir('POST', '/cobros', { cedula: ANA.cedula, canal: 'cuenta', llaveIdempotencia: llaveNueva() })
    expect(r.status).toBe(201)
    expect(r.cuerpo.estado).toBe('Pagando')
  })
})
