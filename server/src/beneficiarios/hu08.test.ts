// HU-08 · «Tengo $230.000»: saldo, cuenta, puntos e historial de la persona.
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

describe('GET /beneficiarios/:cedula/resumen', () => {
  it('muestra a Ana con su pago pendiente, su cuenta verificada y los puntos de retiro', async () => {
    const { status, cuerpo } = await e.pedir('GET', `/beneficiarios/${ANA.documento}/resumen`)
    expect(status).toBe(200)
    expect(cuerpo.persona).toEqual({ nombre: 'Ana Pérez', documento: ANA.documento, cedula: ANA.documento, tienePin: true })
    expect(cuerpo.liquidacionDisponible).toBe(true)
    expect(cuerpo.pagos).toEqual([
      {
        programa: { id: s.programaId, nombre: 'Subsidio de transporte', estado: 'Activo', tipo: 'subsidio' },
        monto: { valor: '23000000', assetCode: 'COP', assetScale: 2 },
        moneda: { codigo: 'COP', escala: 2 },
        asignado: { valor: '23000000', assetCode: 'COP', assetScale: 2 },
        cobrado: { valor: '0', assetCode: 'COP', assetScale: 2 },
        retiroParcial: true,
        montoMinimo: null,
        vigenciaFin: '2026-12-31',
      },
    ])
    expect(cuerpo.pago).toEqual(cuerpo.pagos[0])
    expect(cuerpo.cuenta).toMatchObject({ estado: 'Verificada', documento: ANA.documento })
    expect(cuerpo.puntos.map((p: { id: string }) => p.id).sort()).toEqual([s.puntoId, s.punto2Id].sort())
    expect(cuerpo.ultimoCobro).toBeNull()
    expect(cuerpo.historial).toEqual([])
    expect(JSON.stringify(cuerpo)).not.toMatch(/1111|token|nonce/)
  })

  it('Jorge, sin cuenta, cobra en un punto: el resumen no ofrece cuenta y sí los puntos', async () => {
    const { cuerpo } = await e.pedir('GET', `/beneficiarios/${JORGE.documento}/resumen`)
    expect(cuerpo.persona).toMatchObject({ nombre: 'Jorge Ruiz', documento: JORGE.documento, tienePin: true })
    expect(cuerpo.cuenta).toBeNull()
    expect(cuerpo.puntos).toHaveLength(2)
    expect(cuerpo.pagos[0].programa.id).toBe(s.programaId)
  })

  it('después de cobrar a la cuenta, el historial y ultimoCobro muestran el pago', async () => {
    const cobro = (await e.pedir('POST', '/cobros', { documento: ANA.documento, canal: 'cuenta', llaveIdempotencia: llaveNueva() })).cuerpo
    await e.esperarPagos()
    const { cuerpo } = await e.pedir('GET', `/beneficiarios/${ANA.documento}/resumen`)
    expect(cuerpo.pagos).toEqual([])
    expect(cuerpo.pago).toBeNull()
    expect(cuerpo.ultimoCobro).toMatchObject({ id: cobro.id, estado: 'Pagado', canal: 'cuenta' })
    expect(cuerpo.historial).toHaveLength(1)
    expect(cuerpo.historial[0].id).toBe(cobro.id)
  })

  it('una cédula no registrada es 404 PersonaNoEncontrada; una inválida, 400', async () => {
    const ausente = await e.pedir('GET', '/beneficiarios/1000000077/resumen')
    expect(ausente.status).toBe(404)
    expect(ausente.cuerpo.error.codigo).toBe('PersonaNoEncontrada')
    expect((await e.pedir('GET', '/beneficiarios/ab-12/resumen')).status).toBe(400)
  })
})
