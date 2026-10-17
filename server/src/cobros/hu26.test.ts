// HU-26 · Retiro parcial en el punto y HU-27 · Venta registrada con el retiro (y su envío a
// facturación). Jorge tiene $150.000 en la liquidación, como en el ejemplo de la historia.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ErrorOpenPayments } from '../comun/openPayments.ts'
import { crearEntorno, type Entorno } from '../pruebas/entorno.ts'
import { ANA, escenarioDeCobro, JORGE, LUIS, llaveNueva, type Escenario } from '../pruebas/escenario.ts'

let e: Entorno
let s: Escenario

beforeAll(async () => {
  e = await crearEntorno({
    liquidacion: [
      { cedula: ANA.cedula, nombre: 'Ana Pérez', monto: 23_000_000, pin: ANA.pin },
      { cedula: LUIS.cedula, nombre: 'Luis Gómez', monto: 23_000_000, pin: LUIS.pin },
      { cedula: JORGE.cedula, nombre: 'Jorge Ruiz', monto: 15_000_000, pin: JORGE.pin },
    ],
  })
})
afterAll(() => e.cerrar())
beforeEach(async () => {
  await e.limpiar()
  s = await escenarioDeCobro(e)
})

const pesos = (valor: string) => ({ valor, assetCode: 'COP', assetScale: 2 })

const retiro = (extra: Record<string, unknown> = {}, cedula = JORGE.cedula) =>
  e.pedir('POST', '/cobros', { cedula, canal: 'retiro', puntoId: s.puntoId, programaId: s.programaId, llaveIdempotencia: llaveNueva(), ...extra })

/** Confirma con el PIN y espera el pago y el envío a facturación, que corren en segundo plano. */
async function confirmar(id: string, pin = JORGE.pin) {
  const r = await e.pedir('POST', `/cobros/${id}/confirmar`, { pin })
  await e.esperarPagos()
  await e.esperarFacturacion()
  return r
}

const consultar = async (id: string) => (await e.pedir('GET', `/cobros/${id}`)).cuerpo
const pagosDeJorge = () => e.pedir('GET', `/puntos/${s.puntoId}/pagos?cedula=${JORGE.cedula}`)

describe('HU-26 · retiro completo y parcial', () => {
  it('sin monto, el retiro es todo el saldo y todo se entrega en efectivo', async () => {
    const { status, cuerpo } = await retiro()
    expect(status).toBe(201)
    expect(cuerpo).toMatchObject({ estado: 'PorConfirmar', monto: pesos('15000000'), efectivo: pesos('15000000'), venta: null })
    await confirmar(cuerpo.id)
    expect(await consultar(cuerpo.id)).toMatchObject({ estado: 'Pagado', saldoRestante: pesos('0') })
    expect((await pagosDeJorge()).status).toBe(404)
  })

  it('retira $90.000 de $150.000: le quedan $60.000 y el punto recibe solo el retiro', async () => {
    const c = (await retiro({ monto: '9000000' })).cuerpo
    expect(c).toMatchObject({ monto: pesos('9000000'), efectivo: pesos('9000000') })
    // Mientras está en vuelo, el saldo ya lo descuenta: no se puede usar dos veces
    expect((await consultar(c.id)).saldoRestante).toEqual(pesos('6000000'))
    await confirmar(c.id)
    expect(e.pagos.entrantes.at(-1)).toMatchObject({ monto: 9_000_000, billetera: 'https://ilp.interledger-test.dev/tatu-punto1' })
    expect(e.pagos.salientes.at(-1)).toMatchObject({ monto: 9_000_000 })
    const { cuerpo } = await pagosDeJorge()
    expect(cuerpo.pagos[0]).toMatchObject({ monto: pesos('6000000'), asignado: pesos('15000000'), cobrado: pesos('9000000'), retiroParcial: true })
  })

  it('varios retiros hasta agotar el saldo; después ya no hay pago disponible', async () => {
    for (const valor of ['9000000', '3000000', '3000000']) await confirmar((await retiro({ monto: valor })).cuerpo.id)
    expect((await pagosDeJorge()).status).toBe(404)
    const otro = (await retiro({ monto: '1000000' })).cuerpo
    expect(otro).toMatchObject({ estado: 'Rechazado', motivo: { codigo: 'YaCobrado' } })
    // Tres retiros, la suma es exactamente lo asignado
    expect(e.pagos.salientes.reduce((t, p) => t + p.monto, 0)).toBe(15_000_000)
  })

  it('más que el saldo, centavos o cero: 422 y no se crea cobro', async () => {
    await confirmar((await retiro({ monto: '9000000' })).cuerpo.id)
    const antes = await e.contar('cobro')
    expect((await retiro({ monto: '7000000' })).cuerpo.error).toMatchObject({ codigo: 'SaldoInsuficiente', mensaje: 'El retiro supera el saldo disponible ($60.000)' })
    expect((await retiro({ monto: '3000050' })).cuerpo.error.codigo).toBe('MontoInvalido')
    expect((await retiro({ monto: '0' })).cuerpo.error.codigo).toBe('MontoInvalido')
    expect(await e.contar('cobro')).toBe(antes)
  })

  it('a la cuenta se paga todo lo que queda, sin elegir monto', async () => {
    await confirmar((await retiro({ monto: '10000000' }, ANA.cedula)).cuerpo.id, ANA.pin)
    const cuenta = await e.pedir('POST', '/cobros', { cedula: ANA.cedula, canal: 'cuenta', programaId: s.programaId, llaveIdempotencia: llaveNueva() })
    expect(cuenta.cuerpo).toMatchObject({ canal: 'cuenta', monto: pesos('13000000'), efectivo: null })
    expect((await e.pedir('POST', '/cobros', { cedula: ANA.cedula, canal: 'cuenta', programaId: s.programaId, llaveIdempotencia: llaveNueva(), monto: '1000000' })).status).toBe(400)
  })
})

describe('HU-26 · un solo cobro en vuelo, reintentos y fallos', () => {
  it('con un retiro esperando el PIN, otro se rechaza «en proceso»', async () => {
    await retiro({ monto: '5000000' })
    expect((await retiro({ monto: '5000000' })).cuerpo).toMatchObject({ estado: 'Rechazado', motivo: { codigo: 'EnProceso' } })
  })

  it('dos solicitudes a la vez: una queda viva y la otra se rechaza; nunca se reserva más que el saldo', async () => {
    const [a, b] = await Promise.all([retiro({ monto: '10000000' }), retiro({ monto: '10000000' })])
    // La perdedora se rechaza «en proceso» o, si ya vio la reserva de la otra, con 422 por saldo
    const resultado = (r: typeof a) => r.cuerpo.estado ?? r.cuerpo.error.codigo
    const resultados = [resultado(a), resultado(b)]
    expect(resultados.filter((x) => x === 'PorConfirmar')).toHaveLength(1)
    expect(resultados.filter((x) => x !== 'PorConfirmar')[0]).toMatch(/^(Rechazado|SaldoInsuficiente)$/)
    expect((await e.repos.cobros.dePrograma(s.programaId)).filter((c) => c.estado === 'PorConfirmar')).toHaveLength(1)
  })

  it('el doble clic (misma llave) devuelve el mismo cobro y una sola venta', async () => {
    const llave = llaveNueva()
    const a = await retiro({ monto: '9000000', venta: { valor: '5000000' }, llaveIdempotencia: llave })
    const b = await retiro({ monto: '9000000', venta: { valor: '5000000' }, llaveIdempotencia: llave })
    expect(b.cuerpo.id).toBe(a.cuerpo.id)
    expect(await e.contar('venta')).toBe(1)
  })

  it('un pago que falla en el banco no descuenta el saldo y anula la venta', async () => {
    e.pagos.erroresSaliente.push(new ErrorOpenPayments('ErrorOpenPayments', 400))
    const c = (await retiro({ monto: '9000000', venta: { valor: '5000000' } })).cuerpo
    await confirmar(c.id)
    expect(await consultar(c.id)).toMatchObject({ estado: 'Fallido', venta: { estado: 'Anulada' }, saldoRestante: pesos('15000000') })
    expect((await pagosDeJorge()).cuerpo.pagos[0].monto).toEqual(pesos('15000000'))
    expect(e.facturacion.listar()).toHaveLength(0)
  })

  it('cancelar antes del PIN libera el saldo y anula la venta', async () => {
    const c = (await retiro({ monto: '9000000', venta: { valor: '5000000' } })).cuerpo
    await e.pedir('POST', `/cobros/${c.id}/cancelar`)
    expect((await consultar(c.id)).venta.estado).toBe('Anulada')
    expect((await pagosDeJorge()).cuerpo.pagos[0].monto).toEqual(pesos('15000000'))
  })
})

describe('HU-27 · venta registrada con el retiro', () => {
  it('$90.000 con una compra de $50.000: entrega $40.000 en efectivo y le quedan $60.000', async () => {
    const { status, cuerpo } = await retiro({ monto: '9000000', venta: { valor: '5000000', descripcion: 'Mercado' } })
    expect(status).toBe(201)
    expect(cuerpo).toMatchObject({ monto: pesos('9000000'), efectivo: pesos('4000000'), venta: { valor: pesos('5000000'), descripcion: 'Mercado', estado: 'Registrada' } })
    await confirmar(cuerpo.id)
    expect(await consultar(cuerpo.id)).toMatchObject({ estado: 'Pagado', saldoRestante: pesos('6000000'), venta: { estado: 'Enviada', referenciaFactura: 'FAC-0001', intentosEnvio: 1 } })
    const caja = (await e.pedir('GET', `/puntos/${s.puntoId}/resumen`)).cuerpo
    expect(caja.totales[0]).toMatchObject({ entregado: pesos('4000000'), vendido: pesos('5000000'), reembolsado: pesos('9000000') })
  })

  it('la solicitud a facturación lleva el punto, la persona, el retiro y la venta', async () => {
    const c = (await retiro({ monto: '9000000', venta: { valor: '5000000', descripcion: 'Mercado' } })).cuerpo
    await confirmar(c.id)
    const [f] = e.facturacion.listar()
    expect(f!.solicitud).toMatchObject({
      idVenta: c.venta.id,
      establecimiento: { puntoId: s.puntoId, nombre: 'Tienda Marta' },
      comprador: { tipoDocumento: 'CC', numeroDocumento: JORGE.cedula, nombre: 'Jorge Ruiz' },
      venta: { valor: pesos('5000000'), descripcion: 'Mercado' },
      medioDePago: { tipo: 'subsidio', referenciaCobro: c.referencia, valorRetiro: pesos('9000000'), efectivoEntregado: pesos('4000000') },
    })
  })

  it('la compra debe ser menor que el retiro, mayor que cero y sin centavos: 422 y sin cobro', async () => {
    for (const valor of ['9000000', '9500000', '0', '5000050']) {
      expect((await retiro({ monto: '9000000', venta: { valor } })).cuerpo.error.codigo).toBe('VentaInvalida')
    }
    // Sin monto, el retiro es todo el saldo: la compra se compara contra eso
    expect((await retiro({ venta: { valor: '15000000' } })).cuerpo.error.codigo).toBe('VentaInvalida')
    expect(await e.contar('cobro')).toBe(0)
  })

  it('la venta existe solo en un retiro en el punto', async () => {
    const r = await e.pedir('POST', '/cobros', { cedula: ANA.cedula, canal: 'cuenta', llaveIdempotencia: llaveNueva(), venta: { valor: '1000000' } })
    expect(r.status).toBe(400)
  })
})

describe('HU-27 · facturación aparte del pago', () => {
  it('si facturación está caída, el retiro queda Pagado y la venta guardada; el reenvío no duplica', async () => {
    e.facturacion.modo = 'caido'
    const c = (await retiro({ monto: '9000000', venta: { valor: '5000000' } })).cuerpo
    await confirmar(c.id)
    const pagado = await consultar(c.id)
    expect(pagado).toMatchObject({ estado: 'Pagado', saldoRestante: pesos('6000000'), venta: { estado: 'PorEnviar', intentosEnvio: 1 } })
    expect(pagado.venta.ultimoError).toContain('no está disponible')
    // Un solo pago en el banco: el fallo de facturación no repite nada
    expect(e.pagos.salientes).toHaveLength(1)

    e.facturacion.modo = 'normal'
    const reenvio = await e.pedir('POST', `/ventas/${c.venta.id}/reenviar`)
    expect(reenvio.status).toBe(200)
    expect(reenvio.cuerpo).toMatchObject({ estado: 'Enviada', referenciaFactura: 'FAC-0001', intentosEnvio: 2 })
    // Reenviar algo ya enviado lo devuelve tal cual, sin pedir otra factura
    expect((await e.pedir('POST', `/ventas/${c.venta.id}/reenviar`)).cuerpo).toMatchObject({ estado: 'Enviada', referenciaFactura: 'FAC-0001' })
    expect(e.facturacion.listar()).toHaveLength(1)
    expect(e.pagos.salientes).toHaveLength(1)
  })

  it('si facturación rechaza los datos, la venta queda Rechazada y se puede reenviar', async () => {
    e.facturacion.modo = 'rechaza'
    const c = (await retiro({ monto: '9000000', venta: { valor: '5000000' } })).cuerpo
    await confirmar(c.id)
    expect((await consultar(c.id)).venta).toMatchObject({ estado: 'Rechazada' })
    e.facturacion.modo = 'normal'
    expect((await e.pedir('POST', `/ventas/${c.venta.id}/reenviar`)).cuerpo.estado).toBe('Enviada')
  })

  it('la misma llave de idempotencia: facturación devuelve la misma solicitud', async () => {
    const c = (await retiro({ monto: '9000000', venta: { valor: '5000000' } })).cuerpo
    await confirmar(c.id)
    const [f] = e.facturacion.listar()
    const r = await fetch(`${e.url}/facturacion/facturas`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': c.venta.id },
      body: JSON.stringify(f!.solicitud),
    })
    expect(r.status).toBe(200)
    expect(((await r.json()) as { id: string }).id).toBe('FAC-0001')
    expect(e.facturacion.listar()).toHaveLength(1)
  })

  it('una venta se envía solo con el retiro Pagado', async () => {
    const c = (await retiro({ monto: '9000000', venta: { valor: '5000000' } })).cuerpo
    expect((await e.pedir('POST', `/ventas/${c.venta.id}/reenviar`)).cuerpo.error.codigo).toBe('VentaSinPagar')
    expect((await e.pedir('POST', '/ventas/00000000-0000-4000-8000-000000000000/reenviar')).status).toBe(404)
  })

  it('al arrancar se envían las ventas que quedaron pendientes', async () => {
    e.facturacion.modo = 'caido'
    const c = (await retiro({ monto: '9000000', venta: { valor: '5000000' } })).cuerpo
    await confirmar(c.id)
    e.facturacion.modo = 'normal'
    expect(await e.contenedor.facturacion.recuperarAlArrancar()).toBe(1)
    expect((await e.repos.ventas.deCobro(c.id))!.estado).toBe('Enviada')
  })
})
