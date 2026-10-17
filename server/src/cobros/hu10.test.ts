// HU-10 · Solicitar un cobro con la cédula digitada y HU-11 · Confirmar con PIN. Un bloque por criterio.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { detalleDe } from '../db/repositorios/eventos.ts'
import { crearEntorno, type Entorno } from '../pruebas/entorno.ts'
import { activarPrograma, ANA, escenarioDeCobro, JORGE, llaveNueva, LUIS, type Escenario } from '../pruebas/escenario.ts'

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

const retiro = (documento: string, extra: Record<string, unknown> = {}) =>
  e.pedir('POST', '/cobros', { documento, canal: 'retiro', puntoId: s.puntoId, llaveIdempotencia: llaveNueva(), ...extra })

/** Confirma y espera a que termine el pago en segundo plano. */
async function confirmar(id: string, pin: string) {
  const r = await e.pedir('POST', `/cobros/${id}/confirmar`, { pin })
  await e.esperarPagos()
  return r
}

const cobro = async (id: string) => (await e.repos.cobros.obtener(id))!

describe('CA-10.01 · el punto consulta', () => {
  it('ve «Pago disponible» con la persona y sus pagos', async () => {
    const { status, cuerpo } = await e.pedir('GET', `/puntos/${s.puntoId}/pagos?documento=${JORGE.documento}`)
    expect(status).toBe(200)
    expect(cuerpo).toEqual({
      persona: { nombre: 'Jorge Ruiz', etiqueta: 'C.C. de prueba 3', tienePin: true },
      pagos: [
        {
          programa: { id: s.programaId, nombre: 'Subsidio de transporte', estado: 'Activo', tipo: 'subsidio' },
          monto: '23000000',
          moneda: { codigo: 'COP', escala: 2 },
          vigenciaFin: '2026-12-31',
        },
      ],
    })
  })

  it('una cédula sin pagos y una que no existe responden igual: 404 SinPagoDisponible', async () => {
    e.simulador.marcarPagada(s.programaId, ANA.documento)
    const sinPago = await e.pedir('GET', `/puntos/${s.puntoId}/pagos?documento=${ANA.documento}`)
    const inexistente = await e.pedir('GET', `/puntos/${s.puntoId}/pagos?documento=1000000077`)
    expect(sinPago.status).toBe(404)
    expect(inexistente.status).toBe(404)
    expect(sinPago.cuerpo.error.codigo).toBe('SinPagoDisponible')
    expect(inexistente.cuerpo.error.codigo).toBe('SinPagoDisponible')
  })

  it('un punto que no existe es 404; una cédula inválida, 400', async () => {
    expect((await e.pedir('GET', `/puntos/00000000-0000-4000-8000-000000000000/pagos?documento=${ANA.documento}`)).status).toBe(404)
    expect((await e.pedir('GET', `/puntos/${s.puntoId}/pagos?documento=ab%24`)).status).toBe(400)
  })

  it('quien ya cobró no aparece como pendiente', async () => {
    const c = (await retiro(JORGE.documento)).cuerpo
    await confirmar(c.id, JORGE.pin)
    expect((await e.pedir('GET', `/puntos/${s.puntoId}/pagos?documento=${JORGE.documento}`)).status).toBe(404)
  })

})

describe('CA-10.02 · la solicitud', () => {
  it('con canal retiro el cobro queda PorConfirmar (espera PIN), con su monto y su punto', async () => {
    const { status, cuerpo } = await retiro(JORGE.documento)
    expect(status).toBe(201)
    expect(cuerpo).toMatchObject({
      estado: 'PorConfirmar',
      canal: 'retiro',
      monto: '23000000',
      programa: { id: s.programaId },
      punto: { id: s.puntoId, nombre: 'Tienda Marta' },
      persona: { nombre: 'Jorge Ruiz', etiqueta: 'C.C. de prueba 3', novedad: false },
      intentosRestantes: 3,
      motivo: null,
    })
    expect(cuerpo.referencia).toMatch(/^SUB-\d{4}$/)
    expect(Date.parse(cuerpo.confirmarAntesDe) - Date.parse(cuerpo.creado)).toBe(120_000)
  })

  it('deja los eventos de la línea de tiempo, y no mueve dinero todavía', async () => {
    const { cuerpo } = await retiro(JORGE.documento)
    expect(cuerpo.eventos.map((x: { hacia: string }) => x.hacia)).toEqual(['Solicitado', 'PorConfirmar'])
    expect(cuerpo.eventos[0].texto).toBe('Tienda Marta digitó la cédula.')
    expect(e.pagos.entrantes).toHaveLength(0)
    expect(e.pagos.salientes).toHaveLength(0)
  })

  it('no filtra tokens, URLs de pago ni la cédula completa', async () => {
    const { cuerpo } = await retiro(JORGE.documento)
    const texto = JSON.stringify(cuerpo)
    expect(texto).not.toMatch(/urlPago|token|nonce|1000000003/)
  })

  it('el canal retiro exige un punto; el canal cuenta no lo lleva; un punto inexistente es 404', async () => {
    expect((await retiro(JORGE.documento, { puntoId: undefined })).status).toBe(400)
    expect((await e.pedir('POST', '/cobros', { documento: ANA.documento, canal: 'cuenta', puntoId: s.puntoId, llaveIdempotencia: llaveNueva() })).status).toBe(400)
    expect((await retiro(JORGE.documento, { puntoId: '00000000-0000-4000-8000-000000000000' })).status).toBe(404)
  })

  it('totalCompra solo va en el canal compra', async () => {
    expect((await retiro(JORGE.documento, { totalCompra: '8000000' })).status).toBe(400)
  })

  it('una sede de comercio no hace retiros: 400 PuntoNoAtiendeCanal', async () => {
    e.billeteras.registrar('https://ilp.interledger-test.dev/tatu-sede')
    const id = (await e.pedir('POST', '/puntos', { nombre: 'Sede', billetera: 'https://ilp.interledger-test.dev/tatu-sede', tipo: 'compra' })).cuerpo.id
    const r = await retiro(JORGE.documento, { puntoId: id })
    expect(r.status).toBe(400)
    expect(r.cuerpo.error.codigo).toBe('PuntoNoAtiendeCanal')
  })
})

describe('CA-10.03 · el monto no viene del navegador (RN-11)', () => {
  it('un monto en el cuerpo se rechaza, y el cobro usa el valor de la liquidación', async () => {
    expect((await retiro(JORGE.documento, { monto: '1' })).status).toBe(400)
    const { cuerpo } = await retiro(JORGE.documento)
    expect(cuerpo.monto).toBe('23000000')
    expect((await cobro(cuerpo.id)).monto).toBe(23_000_000)
  })
})

describe('CA-10.04 · el punto no elige programa', () => {
  it('se toma el programa Activo con un pago disponible para la cédula', async () => {
    await e.pedir('POST', `/programas/${s.programaId}/pausar`)
    const otro = await activarPrograma(e, 'Subsidio de vivienda')
    const { cuerpo } = await retiro(JORGE.documento)
    expect(cuerpo).toMatchObject({ estado: 'PorConfirmar', programa: { id: otro, nombre: 'Subsidio de vivienda' } })
  })

  it('si el programa no recibe cobros, el rechazo queda en el programa más relevante', async () => {
    await e.pedir('POST', `/programas/${s.programaId}/pausar`)
    const { cuerpo } = await retiro(JORGE.documento)
    expect(cuerpo).toMatchObject({ estado: 'Rechazado', programa: { id: s.programaId }, motivo: { codigo: 'ProgramaNoRecibe' } })
  })

  it('un programa que se indica explícitamente se respeta, y uno inexistente es 404', async () => {
    expect((await retiro(JORGE.documento, { programaId: s.programaId })).cuerpo.programa.id).toBe(s.programaId)
    expect((await retiro(JORGE.documento, { programaId: '00000000-0000-4000-8000-000000000000' })).status).toBe(404)
  })
})

describe('CA-10.05 · sin PIN no hay retiro', () => {
  it('responde 422 SinPin y no deja cobro', async () => {
    e.simulador.inscribir('1000000009', 'Rosa Díaz')
    await e.repos.beneficiarios.crear('1000000009')
    const antes = await e.contar('cobro')
    const { status, cuerpo } = await retiro('1000000009')
    expect(status).toBe(422)
    expect(cuerpo.error).toEqual({ codigo: 'SinPin', mensaje: 'Esta persona no registró un PIN: solo puede cobrar a su cuenta' })
    expect(await e.contar('cobro')).toBe(antes)
  })

  it('quien no tiene PIN sí puede cobrar a su cuenta', async () => {
    e.simulador.inscribir('1000000009', 'Rosa Díaz')
    e.billeteras.registrar('https://ilp.interledger-test.dev/prueba-rosa')
    await e.pedir('POST', '/beneficiarios', { documento: '1000000009', billetera: '$ilp.interledger-test.dev/prueba-rosa' })
    const { cuerpo } = await e.pedir('POST', '/cobros', { documento: '1000000009', canal: 'cuenta', llaveIdempotencia: llaveNueva() })
    expect(cuerpo.estado).toBe('Pagando')
  })
})

describe('CA-10.06 · rechazos al solicitar: ningún dinero se mueve', () => {
  it('una cédula sin pago disponible deja un cobro Rechazado y no llama al banco', async () => {
    e.simulador.marcarPagada(s.programaId, JORGE.documento)
    const { cuerpo } = await retiro(JORGE.documento)
    expect(cuerpo).toMatchObject({ estado: 'Rechazado', motivo: { codigo: 'SinPagoDisponible' } })
    expect(e.pagos.entrantes).toHaveLength(0)
  })

  it('una cédula que no existe: 404 SinPagoDisponible, sin cobro, con un evento enmascarado', async () => {
    const antes = await e.contar('cobro')
    const r = await retiro('1000000077')
    expect(r.status).toBe(404)
    expect(r.cuerpo.error.codigo).toBe('SinPagoDisponible')
    expect(await e.contar('cobro')).toBe(antes)
    const evento = (await e.repos.eventos.de('programa', s.programaId)).at(-1)!
    expect(detalleDe(evento)).toMatchObject({ documento: '******0077' })
    expect(JSON.stringify(evento)).not.toContain('1000000077')
  })
})

describe('CA-10.07 · idempotencia', () => {
  it('la misma llave devuelve el mismo cobro', async () => {
    const llave = llaveNueva()
    const uno = (await retiro(JORGE.documento, { llaveIdempotencia: llave })).cuerpo
    const dos = (await retiro(JORGE.documento, { llaveIdempotencia: llave })).cuerpo
    expect(dos.id).toBe(uno.id)
    expect(await e.contar('cobro')).toBe(1)
  })

  it('una llave demasiado corta es 400', async () => {
    expect((await retiro(JORGE.documento, { llaveIdempotencia: 'corta' })).status).toBe(400)
  })
})

describe('CA-11.01 · PIN correcto', () => {
  it('pasa a Pagando (202), paga y termina Pagado', async () => {
    const c = (await retiro(JORGE.documento)).cuerpo
    const r = await confirmar(c.id, JORGE.pin)
    expect(r.status).toBe(202)
    expect(r.cuerpo.estado).toBe('Pagando')
    const final = (await e.pedir('GET', `/cobros/${c.id}`)).cuerpo
    expect(final.estado).toBe('Pagado')
    expect(final.eventos.map((x: { hacia: string }) => x.hacia)).toEqual(['Solicitado', 'PorConfirmar', 'Pagando', 'Pagado'])
    expect(final.eventos[2].texto).toBe('PIN correcto. Enviando el pago al punto.')
  })

  it('el pago llega a la billetera del punto, con la referencia del cobro', async () => {
    const c = (await retiro(JORGE.documento)).cuerpo
    await confirmar(c.id, JORGE.pin)
    expect(e.pagos.entrantes[0]).toMatchObject({ billetera: 'https://ilp.interledger-test.dev/tatu-punto1', monto: 23_000_000, referencia: c.referencia })
  })

  it('confirmar dos veces seguidas no paga dos veces', async () => {
    const c = (await retiro(JORGE.documento)).cuerpo
    await confirmar(c.id, JORGE.pin)
    const otra = await confirmar(c.id, JORGE.pin)
    expect(otra.status).toBe(200)
    expect(e.pagos.salientes).toHaveLength(1)
  })

  it('un cobro que no existe es 404; un PIN con formato inválido, 400', async () => {
    expect((await e.pedir('POST', '/cobros/00000000-0000-4000-8000-000000000000/confirmar', { pin: '1111' })).status).toBe(404)
    const c = (await retiro(JORGE.documento)).cuerpo
    expect((await e.pedir('POST', `/cobros/${c.id}/confirmar`, { pin: 'abc' })).status).toBe(400)
  })
})

describe('CA-11.02 · PIN incorrecto', () => {
  it('responde 422 con los intentos que quedan y no cambia el estado', async () => {
    const c = (await retiro(JORGE.documento)).cuerpo
    const r = await confirmar(c.id, '0000')
    expect(r.status).toBe(422)
    expect(r.cuerpo.error).toEqual({ codigo: 'PinIncorrecto', mensaje: 'PIN incorrecto, te quedan 2 intentos' })
    expect((await e.pedir('GET', `/cobros/${c.id}`)).cuerpo).toMatchObject({ estado: 'PorConfirmar', intentosRestantes: 2 })
    expect((await confirmar(c.id, '0001')).cuerpo.error.mensaje).toBe('PIN incorrecto, te queda 1 intento')
  })

  it('después de fallar, el PIN correcto todavía paga', async () => {
    const c = (await retiro(JORGE.documento)).cuerpo
    await confirmar(c.id, '0000')
    expect((await confirmar(c.id, JORGE.pin)).status).toBe(202)
    expect((await cobro(c.id)).estado).toBe('Pagado')
  })
})

describe('CA-11.03 · el último PIN incorrecto rechaza y bloquea la cédula (RN-07)', () => {
  async function tresErrados() {
    const c = (await retiro(JORGE.documento)).cuerpo
    await confirmar(c.id, '0000')
    await confirmar(c.id, '0001')
    return { c, tercero: await confirmar(c.id, '0002') }
  }

  it('el cobro queda Rechazado con «No pudimos confirmar tu identidad»', async () => {
    const { tercero } = await tresErrados()
    expect(tercero.status).toBe(200)
    expect(tercero.cuerpo).toMatchObject({ estado: 'Rechazado', motivo: { codigo: 'PinBloqueado', mensaje: 'No pudimos confirmar tu identidad' } })
  })

  it('la cédula queda bloqueada 15 minutos en ese programa', async () => {
    const { c } = await tresErrados()
    const bloqueo = (await e.repos.bloqueos.de(s.programaId, (await cobro(c.id)).beneficiarioId))!
    expect(Date.parse(bloqueo.bloqueadoHasta)).toBe(e.ahora.getTime() + 15 * 60_000)
    const otra = (await retiro(JORGE.documento)).cuerpo
    expect(otra).toMatchObject({ estado: 'Rechazado', motivo: { codigo: 'PinBloqueado' } })
  })

  it('pasados los 15 minutos puede intentarlo otra vez', async () => {
    await tresErrados()
    e.avanzarReloj(15 * 60_000 + 1000)
    expect((await retiro(JORGE.documento)).cuerpo.estado).toBe('PorConfirmar')
  })

  it('el bloqueo es por programa: otro programa no queda bloqueado', async () => {
    await tresErrados()
    await e.pedir('POST', `/programas/${s.programaId}/pausar`)
    const otro = await activarPrograma(e, 'Subsidio de vivienda')
    expect((await retiro(JORGE.documento, { programaId: otro })).cuerpo.estado).toBe('PorConfirmar')
  })

  it('un bloqueo no afecta a otra persona', async () => {
    await tresErrados()
    expect((await retiro(LUIS.documento)).cuerpo.estado).toBe('PorConfirmar')
  })
})

describe('CA-11.04 · tiempo agotado (RN-12)', () => {
  it('pasados 120 s sin PIN, al consultar queda Rechazado por tiempo agotado y no se mueve dinero', async () => {
    const c = (await retiro(JORGE.documento)).cuerpo
    e.avanzarReloj(121_000)
    const r = (await e.pedir('GET', `/cobros/${c.id}`)).cuerpo
    expect(r).toMatchObject({ estado: 'Rechazado', motivo: { codigo: 'TiempoAgotado' }, intentosRestantes: null, confirmarAntesDe: null })
    expect(e.pagos.entrantes).toHaveLength(0)
  })

  it('dentro del plazo sigue esperando', async () => {
    const c = (await retiro(JORGE.documento)).cuerpo
    e.avanzarReloj(119_000)
    expect((await e.pedir('GET', `/cobros/${c.id}`)).cuerpo.estado).toBe('PorConfirmar')
  })

  it('confirmar vencido responde con el cobro ya Rechazado, sin pagar', async () => {
    const c = (await retiro(JORGE.documento)).cuerpo
    e.avanzarReloj(121_000)
    const r = await confirmar(c.id, JORGE.pin)
    expect(r.status).toBe(200)
    expect(r.cuerpo).toMatchObject({ estado: 'Rechazado', motivo: { codigo: 'TiempoAgotado' } })
    expect(e.pagos.salientes).toHaveLength(0)
  })
})

describe('CA-11.05 · cancelar', () => {
  it('PorConfirmar → Rechazado «El cobro se canceló. No se movió dinero»', async () => {
    const c = (await retiro(JORGE.documento)).cuerpo
    const r = await e.pedir('POST', `/cobros/${c.id}/cancelar`)
    expect(r.status).toBe(200)
    expect(r.cuerpo).toMatchObject({ estado: 'Rechazado', motivo: { codigo: 'Cancelado', mensaje: 'El cobro se canceló. No se movió dinero' } })
    expect(e.pagos.entrantes).toHaveLength(0)
  })

  it('cancelar libera la cédula para intentarlo de nuevo', async () => {
    const c = (await retiro(JORGE.documento)).cuerpo
    await e.pedir('POST', `/cobros/${c.id}/cancelar`)
    expect((await retiro(JORGE.documento)).cuerpo.estado).toBe('PorConfirmar')
  })

  it('solo se cancela un cobro que espera el PIN: 409', async () => {
    const c = (await retiro(JORGE.documento)).cuerpo
    await confirmar(c.id, JORGE.pin)
    const r = await e.pedir('POST', `/cobros/${c.id}/cancelar`)
    expect(r.status).toBe(409)
    expect(r.cuerpo.error.codigo).toBe('EstadoNoPermite')
  })
})

describe('CA-11.06 · privacidad: la plataforma no guarda el PIN', () => {
  it('ni el cobro, ni sus eventos, ni la respuesta contienen el PIN', async () => {
    const c = (await retiro(JORGE.documento)).cuerpo
    await confirmar(c.id, '0000')
    await confirmar(c.id, JORGE.pin)
    const guardado = JSON.stringify([await cobro(c.id), await e.repos.eventos.de('cobro', c.id), (await e.pedir('GET', `/cobros/${c.id}`)).cuerpo])
    expect(guardado).not.toContain('"3333"')
    expect(guardado).not.toContain('"0000"')
  })

  it('el PIN se valida contra la liquidación: nunca se compara aquí', async () => {
    const c = (await retiro(JORGE.documento)).cuerpo
    e.simulador.ponerPin(JORGE.documento, '7777')
    expect((await confirmar(c.id, JORGE.pin)).status).toBe(422)
    expect((await confirmar(c.id, '7777')).status).toBe(202)
  })
})
