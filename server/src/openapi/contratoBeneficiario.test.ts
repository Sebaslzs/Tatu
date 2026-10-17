// Contrato del beneficiario: lo que la API responde cumple los modelos que publica Swagger
// (sin campos de más ni de menos) para el resumen, los cobros, los pagos del punto y las billeteras.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { COP } from '../pruebas/billeterasFalsas.ts'
import { crearEntorno, type Entorno } from '../pruebas/entorno.ts'
import { ANA, BILLETERA_ANA, escenarioDeCobro, JORGE, llaveNueva, type Escenario } from '../pruebas/escenario.ts'
import { BilleteraResuelta, Cobro, Estado, PagosPunto, PersonaDemo, ResumenBeneficiario } from './modelos.ts'

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

describe('contrato del beneficiario', () => {
  it('GET /beneficiarios/demo cumple PersonaDemo', async () => {
    const { cuerpo } = await e.pedir('GET', '/beneficiarios/demo')
    expect(cuerpo.length).toBeGreaterThan(0)
    for (const p of cuerpo) PersonaDemo.parse(p)
  })

  it('GET /beneficiarios/{documento}/resumen cumple ResumenBeneficiario, antes y después de cobrar', async () => {
    const antes = await e.pedir('GET', `/beneficiarios/${ANA.documento}/resumen`)
    expect(antes.status).toBe(200)
    ResumenBeneficiario.parse(antes.cuerpo)
    expect(antes.cuerpo.pagos).toHaveLength(1)

    await e.pedir('POST', '/cobros', { documento: ANA.documento, canal: 'cuenta', llaveIdempotencia: llaveNueva() })
    await e.esperarPagos()
    const despues = await e.pedir('GET', `/beneficiarios/${ANA.documento}/resumen`)
    ResumenBeneficiario.parse(despues.cuerpo)
    expect(despues.cuerpo.pagos).toEqual([])
    expect(despues.cuerpo.ultimoCobro).toMatchObject({ estado: 'Pagado', canal: 'cuenta' })
    expect(despues.cuerpo.cuenta).toMatchObject({ documento: ANA.documento, estado: 'Verificada', billetera: BILLETERA_ANA })
  })

  it('el cobro cumple Cobro en cada paso: pedir, consultar, confirmar y cancelar', async () => {
    const pedido = await e.pedir('POST', '/cobros', { documento: JORGE.documento, canal: 'retiro', puntoId: s.puntoId, llaveIdempotencia: llaveNueva() })
    expect(pedido.status).toBe(201)
    Cobro.parse(pedido.cuerpo)
    expect(pedido.cuerpo).toMatchObject({ estado: 'PorConfirmar', monto: '23000000', moneda: { codigo: 'COP', escala: 2 } })
    expect(pedido.cuerpo.persona).toEqual({ nombre: 'Jorge Ruiz', etiqueta: 'C.C. de prueba 3', novedad: false })

    Cobro.parse((await e.pedir('GET', `/cobros/${pedido.cuerpo.id}`)).cuerpo)
    const confirmado = await e.pedir('POST', `/cobros/${pedido.cuerpo.id}/confirmar`, { pin: JORGE.pin })
    expect(confirmado.status).toBe(202)
    Cobro.parse(confirmado.cuerpo)
    await e.esperarPagos()

    const otro = await e.pedir('POST', '/cobros', { documento: ANA.documento, canal: 'retiro', puntoId: s.puntoId, llaveIdempotencia: llaveNueva() })
    const cancelado = await e.pedir('POST', `/cobros/${otro.cuerpo.id}/cancelar`)
    expect(cancelado.status).toBe(200)
    Cobro.parse(cancelado.cuerpo)
    expect(cancelado.cuerpo.estado).toBe('Rechazado')
  })

  it('GET /puntos/{id}/pagos cumple PagosPunto', async () => {
    const { status, cuerpo } = await e.pedir('GET', `/puntos/${s.puntoId}/pagos?documento=${JORGE.documento}`)
    expect(status).toBe(200)
    PagosPunto.parse(cuerpo)
  })

  it('GET /puntos/{id}/cobros devuelve cobros que cumplen Cobro (sin línea de tiempo)', async () => {
    await e.pedir('POST', '/cobros', { documento: JORGE.documento, canal: 'retiro', puntoId: s.puntoId, llaveIdempotencia: llaveNueva() })
    const { cuerpo } = await e.pedir('GET', `/puntos/${s.puntoId}/cobros?desde=todo`)
    expect(cuerpo).toHaveLength(1)
    for (const c of cuerpo) Cobro.parse(c)
    expect(cuerpo[0]).not.toHaveProperty('eventos')
  })

  it('GET /billeteras/resolver cumple BilleteraResuelta', async () => {
    e.billeteras.registrar('https://ilp.interledger-test.dev/prueba-nueva', COP)
    const { status, cuerpo } = await e.pedir('GET', `/billeteras/resolver?direccion=${encodeURIComponent('$ilp.interledger-test.dev/prueba-nueva')}`)
    expect(status).toBe(200)
    BilleteraResuelta.parse(cuerpo)
  })

  it('GET /estado cumple Estado y nunca muestra la contraseña ni la llave privada', async () => {
    const { status, cuerpo } = await e.pedir('GET', '/estado')
    expect(status).toBe(200)
    Estado.parse(cuerpo)
    expect(JSON.stringify(cuerpo)).not.toMatch(/PRIVATE KEY|password|postgres:\/\//i)
  })
})
