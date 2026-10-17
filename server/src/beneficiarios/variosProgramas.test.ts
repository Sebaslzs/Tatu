// Una persona con subsidios en varios programas (HU-08, CA-08.04) y el monto de cada programa.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { crearEntorno, type Entorno } from '../pruebas/entorno.ts'
import { ANA, activarPrograma, BILLETERA_ANA, BILLETERA_PROGRAMA, BILLETERA_PUNTO, llaveNueva } from '../pruebas/escenario.ts'
import { COP } from '../pruebas/billeterasFalsas.ts'

let e: Entorno
let grande: string
let pequeno: string
let puntoId: string

beforeAll(async () => {
  e = await crearEntorno()
})
afterAll(() => e.cerrar())

beforeEach(async () => {
  await e.limpiar()
  for (const w of [BILLETERA_PROGRAMA, BILLETERA_PUNTO, BILLETERA_ANA]) e.billeteras.registrar(w, COP)
  grande = await activarPrograma(e, 'Subsidio grande')
  // Un segundo programa con otro monto por persona: $10.000 en lugar de los $230.000 de la liquidación
  const entidad = await e.contenedor.uow.repos.entidades.listar()
  pequeno = (
    await e.pedir('POST', '/programas', {
      entidadId: entidad[0]!.id,
      nombre: 'Bono pequeño',
      billetera: BILLETERA_PROGRAMA,
      montoPorPersona: '10000',
      vigenciaInicio: '2026-10-01',
      vigenciaFin: '2026-12-31',
    })
  ).cuerpo.id as string
  await e.pedir('POST', `/programas/${pequeno}/autorizar`)
  await e.pedir('GET', `/callback/${pequeno}?interact_ref=ref-2&hash=${await e.hashValido(pequeno, 'ref-2')}`)
  e.pagos.tope = 69_000_000
  puntoId = (await e.pedir('POST', '/puntos', { nombre: 'Tienda Marta', billetera: BILLETERA_PUNTO })).cuerpo.id as string
  await e.pedir('POST', '/beneficiarios', { documento: ANA.documento, billetera: BILLETERA_ANA, nombre: 'Ana Pérez', pin: ANA.pin })
})

const resumen = async () => (await e.pedir('GET', `/beneficiarios/${ANA.documento}/resumen`)).cuerpo
const pagosEnPunto = (documento: string) => e.pedir('GET', `/puntos/${puntoId}/pagos?documento=${documento}`)

describe('una persona con subsidios en varios programas', () => {
  it('ve todos sus pagos pendientes, con el monto de cada programa', async () => {
    const r = await resumen()
    const montos = r.pagos.map((p: { programa: { id: string }; monto: { valor: string } }) => [p.programa.id, p.monto.valor]).sort()
    expect(montos).toEqual(
      [
        [grande, '23000000'],
        [pequeno, '1000000'],
      ].sort(),
    )
    expect(r.pago).toEqual(r.pagos[0])
  })

  it('el tope de un programa suma lo que paga ese programa', async () => {
    expect((await e.pedir('GET', `/liquidacion/programas/${pequeno}/resumen`)).cuerpo).toMatchObject({ cedulas: 3, total: '3000000' })
  })

  it('cobrar un programa no bloquea el otro', async () => {
    const cuenta = await e.pedir('POST', '/cobros', { programaId: pequeno, documento: ANA.documento, canal: 'cuenta', llaveIdempotencia: llaveNueva() })
    expect(cuenta.status).toBe(201)
    await e.esperarPagos()
    expect((await e.pedir('GET', `/cobros/${cuenta.cuerpo.id}`)).cuerpo).toMatchObject({ estado: 'Pagado', monto: { valor: '1000000' } })
    expect((await resumen()).pagos.map((p: { programa: { id: string } }) => p.programa.id)).toEqual([grande])
  })

  it('el punto solo ve programas que hoy reciben cobros, y no revela cédulas desconocidas', async () => {
    await e.pedir('POST', `/programas/${pequeno}/pausar`)
    expect((await pagosEnPunto(ANA.documento)).cuerpo.pagos).toHaveLength(1)
    // La persona sí lo ve en su resumen
    expect((await resumen()).pagos).toHaveLength(2)
    const desconocida = await pagosEnPunto('12345678')
    expect(desconocida.status).toBe(404)
    expect(desconocida.cuerpo.error.codigo).toBe('SinPagoDisponible')
  })
})
