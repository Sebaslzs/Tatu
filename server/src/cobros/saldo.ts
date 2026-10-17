// Saldo de una persona en un programa y reglas del retiro parcial y de la venta (HU-26, HU-27), como
// funciones puras: sin red ni base de datos.
//
//   saldo disponible = asignado (lo que dice la liquidación) − lo Pagado − lo que está en vuelo
//
// Se calcula siempre desde los cobros, que son la verdad: un cobro Rechazado o Fallido no cuenta, así
// que un pago que no se entregó nunca descuenta el saldo. La base lo repite con la tabla asignacion y
// sus triggers (ACTUALIZACIONES 01 y 02), y el índice de un solo cobro en vuelo por persona evita que
// dos solicitudes simultáneas usen el mismo saldo.
import { textoMonto, type Moneda } from '../comun/montos.ts'
import type { EstadoCobro } from './estados.ts'
import { ESTADOS_EN_VUELO } from './estados.ts'

export interface Saldo {
  asignado: number
  pagado: number
  enVuelo: number
  disponible: number
}

/** Todo subsidio maneja saldo; un bono, solo si su programa permite cobros parciales (hoy ninguno). */
export function manejaSaldo(p: { tipo: 'subsidio' | 'bono'; permiteParcial: boolean }): boolean {
  return p.tipo === 'subsidio' || p.permiteParcial
}

export function saldoDe(asignado: number, cobros: readonly { estado: EstadoCobro; monto: number | null }[]): Saldo {
  const suma = (estados: readonly EstadoCobro[]) => cobros.filter((c) => estados.includes(c.estado)).reduce((t, c) => t + (c.monto ?? 0), 0)
  const pagado = suma(['Pagado'])
  const enVuelo = suma(ESTADOS_EN_VUELO)
  return { asignado, pagado, enVuelo, disponible: Math.max(0, asignado - pagado - enVuelo) }
}

/** Un fallo de las reglas del retiro o de la venta: código estable y el texto para el punto. */
export interface Incumplimiento {
  codigo: 'MontoInvalido' | 'SaldoInsuficiente' | 'VentaInvalida'
  mensaje: string
}

const enteroPositivo = (v: number) => Number.isSafeInteger(v) && v > 0
/** El efectivo no tiene centavos: el monto va en unidades enteras de la moneda. */
const enUnidadesEnteras = (v: number, escala: number) => v % 10 ** escala === 0

/**
 * RN-19 a RN-21 · el monto de un retiro: mayor que 0, en unidades enteras de la moneda, que quepa en
 * el saldo y que respete el mínimo del programa (salvo que sea justo lo que queda).
 */
export function rn21MontoRetiro(args: { monto: number; disponible: number; moneda: Moneda; minimo: number | null }): Incumplimiento | null {
  const { monto, disponible, moneda, minimo } = args
  if (!enteroPositivo(monto)) return { codigo: 'MontoInvalido', mensaje: 'El valor del retiro debe ser mayor que cero' }
  if (!enUnidadesEnteras(monto, moneda.assetScale)) return { codigo: 'MontoInvalido', mensaje: 'El retiro va en pesos enteros, sin centavos' }
  if (monto > disponible) {
    return { codigo: 'SaldoInsuficiente', mensaje: `El retiro supera el saldo disponible (${textoMonto(disponible, moneda)})` }
  }
  if (minimo !== null && monto < minimo && monto !== disponible) {
    return { codigo: 'MontoInvalido', mensaje: `El retiro mínimo de este programa es ${textoMonto(minimo, moneda)}` }
  }
  return null
}

/**
 * RN-23 · la venta registrada en un retiro: mayor que 0, en unidades enteras y MENOR que el retiro.
 * Es parte del retiro: el efectivo que se entrega es retiro − venta, y siempre queda algo en efectivo.
 */
export function rn23Venta(args: { valor: number; montoRetiro: number; moneda: Moneda }): Incumplimiento | null {
  const { valor, montoRetiro, moneda } = args
  if (!enteroPositivo(valor)) return { codigo: 'VentaInvalida', mensaje: 'El valor de la compra debe ser mayor que cero' }
  if (!enUnidadesEnteras(valor, moneda.assetScale)) return { codigo: 'VentaInvalida', mensaje: 'La compra va en pesos enteros, sin centavos' }
  if (valor >= montoRetiro) {
    return { codigo: 'VentaInvalida', mensaje: `La compra debe ser menor que el retiro (${textoMonto(montoRetiro, moneda)})` }
  }
  return null
}

/** Lo que el punto entrega en la mano: el retiro menos la compra registrada. */
export const efectivoDe = (montoRetiro: number, venta: number | null) => montoRetiro - (venta ?? 0)
