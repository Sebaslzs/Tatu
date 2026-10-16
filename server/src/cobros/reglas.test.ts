// Las reglas de negocio del cobro como tablas de casos: funciones puras, sin red ni base.
import { describe, expect, it } from 'vitest'
import {
  confirmarAntesDe,
  rn01PagoDisponible,
  rn02CobroExistente,
  rn03CanalPermitido,
  rn04CuentaLista,
  rn05Monto,
  rn06ProgramaRecibe,
  rn07Bloqueada,
  rn07EvaluarPin,
  rn10Resultado,
  rn11MontoValido,
  rn12Vencio,
} from './reglas.ts'

const COP = { assetCode: 'COP', assetScale: 2 }
const AHORA = new Date('2026-10-16T15:00:00Z')

describe('RN-01 · pago disponible', () => {
  it.each([
    [{ disponible: true }, null],
    [{ disponible: false }, 'SinPagoDisponible'],
    [null, 'SinPagoDisponible'],
  ] as const)('%j → %s', (pago, esperado) => {
    expect(rn01PagoDisponible(pago)).toBe(esperado)
  })
})

describe('RN-02 · un solo cobro vivo por persona y programa', () => {
  it.each([
    [null, null],
    ['Solicitado', 'EnProceso'],
    ['PorConfirmar', 'EnProceso'],
    ['Pagando', 'EnProceso'],
    ['Pagado', 'YaCobrado'],
  ] as const)('el existente %s → %s', (estado, esperado) => {
    expect(rn02CobroExistente(estado)).toBe(esperado)
  })
})

describe('RN-03 · canal permitido por el destino', () => {
  it.each([
    ['libre', 'cuenta', undefined, null],
    ['libre', 'retiro', undefined, null],
    ['libre', 'compra', undefined, 'ProgramaNoRecibe'],
    ['restringido', 'cuenta', undefined, 'SoloEnComercios'],
    ['restringido', 'retiro', undefined, 'SoloEnComercios'],
    ['restringido', 'compra', true, null],
    ['restringido', 'compra', false, 'ComercioNoAutorizado'],
  ] as const)('destino %s, canal %s, comercio autorizado %s → %s', (destino, canal, puntoAutorizado, esperado) => {
    expect(rn03CanalPermitido({ destino, canal, puntoAutorizado })).toBe(esperado)
  })
})

describe('RN-04 · la cuenta está verificada y en la moneda del programa', () => {
  it.each([
    ['sin cuenta', null, COP, 'CuentaNoVerificada'],
    ['por verificar', { estado: 'PorVerificar' }, COP, 'CuentaNoVerificada'],
    ['sin enlazar', { estado: 'SinEnlazar' }, COP, 'CuentaNoVerificada'],
    ['verificada y misma moneda', { estado: 'Verificada' }, COP, null],
    ['verificada y otra moneda', { estado: 'Verificada' }, { assetCode: 'USD', assetScale: 2 }, 'CuentaNoVerificada'],
    ['verificada y otra escala', { estado: 'Verificada' }, { assetCode: 'COP', assetScale: 0 }, 'CuentaNoVerificada'],
    ['verificada sin moneda conocida', { estado: 'Verificada' }, null, 'CuentaNoVerificada'],
  ] as const)('%s → %s', (_caso, cuenta, monedaCuenta, esperado) => {
    expect(rn04CuentaLista({ cuenta, monedaCuenta, monedaPrograma: COP })).toBe(esperado)
  })
})

describe('RN-05 · el monto lo calcula el backend', () => {
  it('un subsidio paga el valor completo, sin importar el total de una compra', () => {
    expect(rn05Monto({ tipo: 'subsidio', valorDisponible: 23_000_000 })).toBe(23_000_000)
    expect(rn05Monto({ tipo: 'subsidio', valorDisponible: 23_000_000, totalCompra: 5 })).toBe(23_000_000)
  })

  it.each([
    [6_000_000, 8_000_000, 6_000_000],
    [6_000_000, 4_000_000, 4_000_000],
  ])('un bono de %i con una compra de %i paga %i', (valorDisponible, totalCompra, esperado) => {
    expect(rn05Monto({ tipo: 'bono', valorDisponible, totalCompra })).toBe(esperado)
  })

  it.each([
    ['sin el total de la compra', { tipo: 'bono' as const, valorDisponible: 6_000_000 }],
    ['con un total de cero', { tipo: 'bono' as const, valorDisponible: 6_000_000, totalCompra: 0 }],
    ['con un valor de cero', { tipo: 'subsidio' as const, valorDisponible: 0 }],
    ['con un valor fraccionario', { tipo: 'subsidio' as const, valorDisponible: 1.5 }],
  ])('un monto inválido (%s) lanza', (_caso, args) => {
    expect(() => rn05Monto(args)).toThrow()
  })
})

describe('RN-06 · el programa recibe cobros', () => {
  const vigencia = { vigenciaInicio: '2026-10-01T05:00:00Z', vigenciaFin: '2026-12-31T04:59:59Z' }
  it.each([
    ['Activo', AHORA, null],
    ['Activo', new Date('2026-09-30T00:00:00Z'), 'ProgramaNoRecibe'],
    ['Activo', new Date('2027-01-01T00:00:00Z'), 'ProgramaNoRecibe'],
    ['Pausado', AHORA, 'ProgramaNoRecibe'],
    ['Borrador', AHORA, 'ProgramaNoRecibe'],
    ['EsperandoAprobacion', AHORA, 'ProgramaNoRecibe'],
    ['Cerrado', AHORA, 'ProgramaCerrado'],
  ] as const)('%s el %s → %s', (estado, ahora, esperado) => {
    expect(rn06ProgramaRecibe({ estado, ahora, ...vigencia })).toBe(esperado)
  })
})

describe('RN-07 · PIN y bloqueo', () => {
  it.each([
    [true, 0, { resultado: 'correcto' }],
    [true, 2, { resultado: 'correcto' }],
    [false, 0, { resultado: 'incorrecto', intentos: 1, restantes: 2 }],
    [false, 1, { resultado: 'incorrecto', intentos: 2, restantes: 1 }],
    [false, 2, { resultado: 'bloqueado', intentos: 3 }],
  ])('PIN válido=%s con %i intentos previos → %j', (valido, intentosPrevios, esperado) => {
    expect(rn07EvaluarPin({ valido, intentosPrevios, maxIntentos: 3 })).toEqual(esperado)
  })

  it.each([
    [null, false],
    ['2026-10-16T15:15:00Z', true],
    ['2026-10-16T15:00:00Z', false],
    ['2026-10-16T14:59:00Z', false],
  ])('bloqueado hasta %s → %s', (bloqueadoHasta, esperado) => {
    expect(rn07Bloqueada({ bloqueadoHasta, ahora: AHORA })).toBe(esperado)
  })
})

describe('RN-11 · montos válidos', () => {
  it.each([
    ['23000000', 2, true],
    ['1', 0, true],
    ['0', 2, false],
    ['-5', 2, false],
    ['1.5', 2, false],
    ['abc', 2, false],
    ['100', -1, false],
  ])('«%s» con escala %i → %s', (monto, escala, esperado) => {
    expect(rn11MontoValido({ monto, escala })).toBe(esperado)
  })
})

describe('RN-12 · el PorConfirmar vence', () => {
  const desde = '2026-10-16T14:58:00Z'
  it.each([
    ['PorConfirmar', 119, false],
    ['PorConfirmar', 120, false],
    ['PorConfirmar', 121, true],
    ['Pagando', 9999, false],
    ['Solicitado', 9999, false],
  ] as const)('%s tras %i s → %s', (estado, segundos, esperado) => {
    expect(rn12Vencio({ estado, desde, ahora: new Date(Date.parse(desde) + segundos * 1000), ttlSeg: 120 })).toBe(esperado)
  })

  it('confirmarAntesDe suma el plazo al inicio', () => {
    expect(confirmarAntesDe('2026-10-16T14:58:00Z', 120)).toBe('2026-10-16T15:00:00.000Z')
  })
})

describe('RN-10 · cuándo un pago está Pagado', () => {
  const saliente = (cambio: Partial<{ fallido: boolean; debitado: string; enviado: string }> = {}) => ({
    fallido: false,
    debitado: '100',
    enviado: '100',
    ...cambio,
  })
  it.each([
    ['el saliente envió todo', { saliente: saliente() }, 'Pagado'],
    ['el saliente envió de más', { saliente: saliente({ enviado: '101' }) }, 'Pagado'],
    ['el saliente falló', { saliente: saliente({ fallido: true }) }, 'Fallido'],
    ['el saliente aún no envía', { saliente: saliente({ enviado: '0' }) }, 'Pagando'],
    ['no hay saliente ni entrante', { saliente: null }, 'Pagando'],
    ['el saliente aún no envía pero el entrante se completó', { saliente: saliente({ enviado: '0' }), entrante: { completado: true, recibido: '100' } }, 'Pagado'],
    ['el entrante recibió lo esperado', { saliente: saliente({ enviado: '0' }), entrante: { completado: false, recibido: '100', esperado: '100' } }, 'Pagado'],
    ['el entrante recibió menos de lo esperado', { saliente: saliente({ enviado: '0' }), entrante: { completado: false, recibido: '40', esperado: '100' } }, 'Pagando'],
  ] as const)('%s → %s', (_caso, args, esperado) => {
    expect(rn10Resultado(args)).toBe(esperado)
  })
})
