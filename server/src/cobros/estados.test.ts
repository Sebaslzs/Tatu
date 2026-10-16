import { describe, expect, it } from 'vitest'
import { despuesDeSolicitado, ESTADOS_COBRO, ESTADOS_VIVOS, esFinal, puedeTransicionar, transicionar, TransicionInvalida } from './estados.ts'
import { MOTIVOS, mensajePinIncorrecto, motivo, motivoDesdeBd } from './mensajes.ts'

describe('máquina de estados del cobro', () => {
  it.each([
    ['Solicitado', 'PorConfirmar'],
    ['Solicitado', 'Pagando'],
    ['Solicitado', 'Rechazado'],
    ['PorConfirmar', 'Pagando'],
    ['PorConfirmar', 'Rechazado'],
    ['Pagando', 'Pagado'],
    ['Pagando', 'Fallido'],
  ] as const)('permite %s → %s', (desde, hacia) => {
    expect(transicionar(desde, hacia)).toBe(hacia)
  })

  it('no hay rollback después del punto de no retorno', () => {
    expect(puedeTransicionar('Pagando', 'Rechazado')).toBe(false)
    expect(puedeTransicionar('Pagando', 'PorConfirmar')).toBe(false)
    expect(() => transicionar('Pagando', 'PorConfirmar')).toThrowError(TransicionInvalida)
  })

  it('antes de Pagando no se salta ningún paso hacia un final de pago', () => {
    expect(puedeTransicionar('Solicitado', 'Pagado')).toBe(false)
    expect(puedeTransicionar('PorConfirmar', 'Pagado')).toBe(false)
    expect(puedeTransicionar('PorConfirmar', 'Fallido')).toBe(false)
  })

  it('los estados finales no salen', () => {
    for (const final of ['Pagado', 'Fallido', 'Rechazado'] as const) {
      expect(esFinal(final)).toBe(true)
      for (const hacia of ESTADOS_COBRO) expect(puedeTransicionar(final, hacia)).toBe(false)
    }
    for (const vivo of ['Solicitado', 'PorConfirmar', 'Pagando'] as const) expect(esFinal(vivo)).toBe(false)
  })

  it('el canal cuenta paga sin PIN; retiro y compra esperan el PIN', () => {
    expect(despuesDeSolicitado('cuenta')).toBe('Pagando')
    expect(despuesDeSolicitado('retiro')).toBe('PorConfirmar')
    expect(despuesDeSolicitado('compra')).toBe('PorConfirmar')
  })

  it('un cobro Rechazado libera la cédula: no cuenta como vivo (CA-14.04)', () => {
    expect(ESTADOS_VIVOS).toEqual(['Solicitado', 'PorConfirmar', 'Pagando', 'Pagado'])
    expect(ESTADOS_VIVOS).not.toContain('Rechazado')
    expect(ESTADOS_VIVOS).not.toContain('Fallido')
  })
})

describe('catálogo de mensajes (HU-13)', () => {
  it.each([
    ['YaCobrado', 'Este subsidio ya fue cobrado', 'Rechazado'],
    ['EnProceso', 'Este subsidio ya está en proceso o fue cobrado', 'Rechazado'],
    ['TopeSuperado', 'El banco rechazó el pago: el programa llegó a su tope', 'Fallido'],
    ['ProgramaCerrado', 'El programa está cerrado y ya no recibe cobros', 'Rechazado'],
    ['SinPagoDisponible', 'Esta cédula no tiene pagos disponibles en este programa', 'Rechazado'],
    ['CuentaNoVerificada', 'Primero enlaza y verifica tu cuenta', 'Rechazado'],
    ['PinBloqueado', 'No pudimos confirmar tu identidad', 'Rechazado'],
    ['TiempoAgotado', 'No pudimos confirmar tu identidad', 'Rechazado'],
    ['ProgramaNoRecibe', 'El programa no está recibiendo cobros', 'Rechazado'],
    ['SinFondos', 'El programa no tiene fondos en este momento', 'Fallido'],
    ['LiquidacionNoResponde', 'No pudimos consultar tu pago; intenta en un momento', 'Rechazado'],
    ['PermisoVencido', 'El permiso venció: apruébalo de nuevo', 'Fallido'],
    ['ComercioNoAutorizado', 'Este comercio no acepta este bono', 'Rechazado'],
    ['SoloEnComercios', 'Este bono solo se usa en comercios autorizados', 'Rechazado'],
    ['LlaveNoExiste', 'Tu llave Bre-B ya no existe: enlaza otra o cobra en un punto', 'Rechazado'],
    ['PuenteNoResponde', 'No pudimos consultar Bre-B; intenta en un momento', 'Rechazado'],
    ['ErrorPago', 'El banco no pudo procesar el pago. No se movió dinero', 'Fallido'],
    ['Cancelado', 'El cobro se canceló. No se movió dinero', 'Rechazado'],
  ] as const)('%s: «%s» (%s)', (codigo, mensaje, estado) => {
    expect(MOTIVOS[codigo]).toEqual({ mensaje, estado })
    expect(motivo(codigo)).toEqual({ codigo, mensaje })
  })

  it('un motivo guardado en la base se traduce; uno desconocido se muestra tal cual; sin motivo, null', () => {
    expect(motivoDesdeBd('Cancelado')).toEqual({ codigo: 'Cancelado', mensaje: 'El cobro se canceló. No se movió dinero' })
    expect(motivoDesdeBd('Otro')).toEqual({ codigo: 'Otro', mensaje: 'Otro' })
    expect(motivoDesdeBd(null)).toBeNull()
  })

  it('el PIN incorrecto dice cuántos intentos quedan, en singular y plural', () => {
    expect(mensajePinIncorrecto(2)).toBe('PIN incorrecto, te quedan 2 intentos')
    expect(mensajePinIncorrecto(1)).toBe('PIN incorrecto, te queda 1 intento')
  })

  it('un Rechazado nunca mueve dinero: solo los fallos del banco son Fallido (CA-13.03)', () => {
    const fallidos = Object.entries(MOTIVOS).filter(([, m]) => m.estado === 'Fallido').map(([c]) => c)
    expect(fallidos.sort()).toEqual(['ErrorPago', 'PermisoVencido', 'SinFondos', 'TopeSuperado'])
  })
})
