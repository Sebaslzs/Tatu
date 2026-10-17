// Lo que la API muestra de un cobro: una lista blanca de campos. Nunca tokens, URLs de pago ni la
// cédula completa. Con la base lejos, una consulta por fila vuelve lenta la app: las listas cargan
// primero lo que necesitan (una consulta por tabla, en paralelo) y arman cada vista sin ir a la base.
import { billeteraCorta } from '../comun/billeteras.ts'
import { enmascararDocumento } from '../comun/log.ts'
import { monto, montoOpcional, type Moneda, type Monto } from '../comun/montos.ts'
import type { FilaBeneficiario } from '../db/repositorios/beneficiarios.ts'
import type { FilaCobro } from '../db/repositorios/cobros.ts'
import type { FilaCuenta } from '../db/repositorios/cuentas.ts'
import { detalleDe, ultimoHaciaEn, type FilaEvento } from '../db/repositorios/eventos.ts'
import type { FilaPrograma } from '../db/repositorios/programas.ts'
import type { FilaPunto } from '../db/repositorios/puntos.ts'
import type { FilaVenta } from '../db/repositorios/ventas.ts'
import type { UnidadDeTrabajo } from '../db/unidadDeTrabajo.ts'
import { vistaVenta, type VistaVenta } from '../facturacion/vista.ts'
import type { Persona, PuertoLiquidacion } from '../liquidacion/contrato.ts'
import { monedaDe } from '../programas/vista.ts'
import type { Canal } from '../programas/reglas.ts'
import type { EstadoCobro } from './estados.ts'
import { motivoDesdeBd, type MotivoVisible } from './mensajes.ts'
import { confirmarAntesDe } from './reglas.ts'
import { efectivoDe, manejaSaldo, saldoDe } from './saldo.ts'

export interface VistaEvento {
  desde: string | null
  hacia: string | null
  texto: string | null
  creado: string
}

export interface VistaCobro {
  id: string
  referencia: string
  programa: { id: string; nombre: string }
  canal: Canal
  punto: { id: string; nombre: string; billeteraCorta: string } | null
  cuenta: { billeteraCorta: string } | null
  persona: { nombre: string; cedula: string; novedad: boolean }
  monto: Monto | null
  totalCompra: Monto | null
  moneda: Moneda
  estado: EstadoCobro
  motivo: MotivoVisible | null
  /** PIN que le quedan a la persona; solo mientras el cobro espera el PIN. */
  intentosRestantes: number | null
  /** Hasta cuándo se puede confirmar; solo mientras el cobro espera el PIN. */
  confirmarAntesDe: string | null
  segundosHastaPagado: number | null
  /** HU-27: la compra registrada con un retiro y su envío a facturación; null si no hubo. */
  venta: VistaVenta | null
  /** Retiro: lo que el punto entrega en efectivo (el retiro menos la compra). null en otros canales. */
  efectivo: Monto | null
  /** HU-26: lo que le queda a la persona en el programa. Solo al consultar un cobro; null en las listas. */
  saldoRestante: Monto | null
  creado: string
  actualizado: string
  eventos?: VistaEvento[]
}

/** Todo lo que necesitan las vistas de una lista de cobros, cargado de una vez. */
export interface ContextoCobros {
  programas: Map<string, FilaPrograma>
  puntos: Map<string, FilaPunto>
  beneficiarios: Map<string, FilaBeneficiario>
  cuentas: Map<string, FilaCuenta>
  eventos: Map<string, FilaEvento[]>
  personas: Map<string, Persona>
  ventas: Map<string, FilaVenta>
}

export interface ParametrosVista {
  confirmacionTtlSeg: number
  pinMaxIntentos: number
}

const definidos = <T>(lista: (T | null | undefined)[]): T[] => lista.filter((x): x is T => x !== null && x !== undefined)

/** Segundos entre el PIN (o la solicitud, en el canal cuenta) y Pagado, sacados de los eventos. */
function segundosHastaPagado(c: FilaCobro, eventos: FilaEvento[]): number | null {
  if (c.estado !== 'Pagado') return null
  const pagado = ultimoHaciaEn(eventos, 'Pagado')?.creadoEn
  const desde = ultimoHaciaEn(eventos, c.canal === 'cuenta' ? 'Solicitado' : 'Pagando')?.creadoEn
  if (!pagado || !desde) return null
  return Math.round((Date.parse(pagado) - Date.parse(desde)) / 100) / 10
}

/** ¿La liquidación marcó este pago como novedad (retroactivo)? Se anota en el primer evento. */
const esNovedad = (eventos: FilaEvento[]): boolean => (eventos[0] ? detalleDe(eventos[0]).novedad === true : false)

export function vistaEventos(lista: readonly FilaEvento[]): VistaEvento[] {
  return lista.map((e) => {
    const d = detalleDe(e)
    return { desde: e.estadoAnterior, hacia: e.estadoNuevo, texto: typeof d.texto === 'string' ? d.texto : null, creado: e.creadoEn }
  })
}

export class VistasCobro {
  private readonly uow: UnidadDeTrabajo
  private readonly liquidacion: PuertoLiquidacion
  private readonly parametros: ParametrosVista

  constructor(uow: UnidadDeTrabajo, liquidacion: PuertoLiquidacion, parametros: ParametrosVista) {
    this.uow = uow
    this.liquidacion = liquidacion
    this.parametros = parametros
  }

  /** Los nombres los tiene la liquidación; si no responde, las pantallas siguen con «Persona 1234». */
  async personas(cedulas: readonly string[]): Promise<Map<string, Persona>> {
    try {
      return await this.liquidacion.personas(cedulas)
    } catch {
      return new Map()
    }
  }

  async contextoDe(lista: readonly FilaCobro[]): Promise<ContextoCobros> {
    const { repos } = this.uow
    // Los nombres dependen de las cédulas, pero van en paralelo con el resto de las consultas
    const conPersonas = repos.beneficiarios
      .deIds(lista.map((c) => c.beneficiarioId))
      .then(async (bs) => ({ bs, personas: await this.personas([...bs.values()].map((b) => b.numeroDocumento)) }))
    const [programas, puntos, cuentas, eventos, ventas, { bs, personas }] = await Promise.all([
      repos.programas.deIds(lista.map((c) => c.programaId)),
      repos.puntos.deIds(definidos(lista.map((c) => c.puntoId))),
      repos.cuentas.deIds(definidos(lista.map((c) => c.cuentaId))),
      repos.eventos.deVarias('cobro', lista.map((c) => c.id)),
      repos.ventas.deCobros(lista.filter((c) => c.canal === 'retiro').map((c) => c.id)),
      conPersonas,
    ])
    return { programas, puntos, beneficiarios: bs, cuentas, eventos, personas, ventas }
  }

  vista(c: FilaCobro, ctx: ContextoCobros, opciones: { eventos?: boolean } = { eventos: true }): VistaCobro {
    const programa = ctx.programas.get(c.programaId)!
    const punto = c.puntoId ? ctx.puntos.get(c.puntoId) : undefined
    const persona = ctx.beneficiarios.get(c.beneficiarioId)!
    const cuenta = c.cuentaId ? ctx.cuentas.get(c.cuentaId) : undefined
    const eventos = ctx.eventos.get(c.id) ?? []
    const venta = ctx.ventas.get(c.id)
    const moneda = monedaDe(programa)
    const { confirmacionTtlSeg, pinMaxIntentos } = this.parametros
    return {
      id: c.id,
      referencia: c.referencia,
      programa: { id: programa.id, nombre: programa.nombre },
      canal: c.canal,
      punto: punto ? { id: punto.id, nombre: punto.nombre, billeteraCorta: billeteraCorta(punto.billetera) } : null,
      cuenta: cuenta ? { billeteraCorta: billeteraCorta(cuenta.billetera) } : null,
      persona: {
        nombre: ctx.personas.get(persona.numeroDocumento)?.nombre ?? `Persona ${persona.numeroDocumento.slice(-4)}`,
        cedula: enmascararDocumento(persona.numeroDocumento),
        novedad: esNovedad(eventos),
      },
      monto: montoOpcional(c.monto, moneda),
      totalCompra: montoOpcional(c.totalCompra, moneda),
      moneda,
      estado: c.estado,
      motivo: motivoDesdeBd(c.motivoRechazo),
      intentosRestantes: c.estado === 'PorConfirmar' ? Math.max(0, pinMaxIntentos - c.intentosPin) : null,
      confirmarAntesDe: c.estado === 'PorConfirmar' ? confirmarAntesDe(c.creadoEn, confirmacionTtlSeg) : null,
      segundosHastaPagado: segundosHastaPagado(c, eventos),
      venta: venta ? vistaVenta(venta, moneda) : null,
      efectivo: c.canal === 'retiro' && c.monto !== null ? monto(efectivoDe(c.monto, venta?.valor ?? null), moneda) : null,
      saldoRestante: null,
      creado: c.creadoEn,
      actualizado: c.actualizadoEn,
      ...(opciones.eventos ? { eventos: vistaEventos(eventos) } : {}),
    }
  }

  async de(lista: readonly FilaCobro[], opciones: { eventos?: boolean } = { eventos: true }): Promise<VistaCobro[]> {
    const ctx = await this.contextoDe(lista)
    return lista.map((c) => this.vista(c, ctx, opciones))
  }

  async una(c: FilaCobro, opciones: { eventos?: boolean } = { eventos: true }): Promise<VistaCobro> {
    const ctx = await this.contextoDe([c])
    const v = this.vista(c, ctx, opciones)
    return { ...v, saldoRestante: await this.saldoRestante(c, ctx) }
  }

  /**
   * HU-26: lo que le queda a la persona después de este cobro (para el resumen del punto y el
   * comprobante). Sale de la liquidación y de sus cobros; si la liquidación no responde, null.
   */
  private async saldoRestante(c: FilaCobro, ctx: ContextoCobros): Promise<Monto | null> {
    const programa = ctx.programas.get(c.programaId)!
    if (!manejaSaldo(programa)) return null
    const persona = ctx.beneficiarios.get(c.beneficiarioId)!
    try {
      const pago = await this.liquidacion.pago(programa.id, persona.numeroDocumento)
      if (pago.tipo !== 'disponible') return null
      const cobros = await this.uow.repos.cobros.dePersonaEnPrograma(programa.id, persona.id)
      return monto(saldoDe(pago.monto, cobros).disponible, monedaDe(programa))
    } catch {
      return null
    }
  }
}
