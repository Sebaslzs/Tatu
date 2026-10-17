// Enviar a facturación las ventas registradas en un retiro (HU-27). Va aparte del pago: el retiro ya
// está Pagado y su dinero ya se movió; si facturación falla, la venta queda guardada y se reintenta,
// pero nunca se toca el cobro, el saldo ni Open Payments.
//
// Sin worker, como el pagador: se envía al quedar Pagado, al consultar el cobro (si toca), al
// reenviar a mano y al arrancar. Toda solicitud lleva la misma `Idempotency-Key` (el id de la
// venta), así un reintento nunca crea dos facturas.
import { conflicto, noEncontrado } from '../comun/errores.ts'
import type { Reloj } from '../comun/fechas.ts'
import { log } from '../comun/log.ts'
import { monto } from '../comun/montos.ts'
import type { CamposVenta, FilaVenta } from '../db/repositorios/ventas.ts'
import type { UnidadDeTrabajo } from '../db/unidadDeTrabajo.ts'
import type { PuertoLiquidacion } from '../liquidacion/contrato.ts'
import { monedaDe } from '../programas/vista.ts'
import { efectivoDe } from '../cobros/saldo.ts'
import type { PuertoFacturacion, ResultadoEnvio, SolicitudFactura } from './contrato.ts'
import { vistaVenta, type VistaVenta } from './vista.ts'

export interface DependenciasFacturacion {
  uow: UnidadDeTrabajo
  facturacion: PuertoFacturacion
  liquidacion: PuertoLiquidacion
  reloj: Reloj
}

/** Al consultar un cobro se reintenta una venta pendiente como máximo cada tanto. */
const ESPERA_ENTRE_REINTENTOS_MS = 15_000

export class ServicioFacturacion {
  private readonly deps: DependenciasFacturacion
  /** Un solo envío por venta a la vez. */
  private readonly enCurso = new Map<string, Promise<void>>()
  private readonly ultimoIntento = new Map<string, number>()

  constructor(deps: DependenciasFacturacion) {
    this.deps = deps
  }

  /** En segundo plano, después de responder (lo llama MovimientosCobro al quedar Pagado el retiro). */
  disparar(ventaId: string): void {
    void this.enviar(ventaId)
  }

  /** Al consultar un cobro: si su venta sigue por enviar y ya pasó un rato, se intenta otra vez. */
  intentarSiToca(venta: Pick<FilaVenta, 'id' | 'estado'>): void {
    if (venta.estado !== 'PorEnviar' || this.enCurso.has(venta.id)) return
    if (this.deps.reloj().getTime() - (this.ultimoIntento.get(venta.id) ?? 0) < ESPERA_ENTRE_REINTENTOS_MS) return
    this.disparar(venta.id)
  }

  /**
   * «Reenviar a facturación» desde el punto. Una venta ya Enviada se devuelve tal cual (no hay
   * segunda factura); una Rechazada vuelve a PorEnviar; una Registrada o Anulada no se envía.
   */
  async reenviar(ventaId: string): Promise<VistaVenta> {
    const { uow } = this.deps
    let v = await uow.repos.ventas.obtener(ventaId)
    if (!v) throw noEncontrado('Esa venta no existe', 'VentaNoEncontrada')
    if (v.estado === 'Registrada') throw conflicto('VentaSinPagar', 'La venta se envía a facturar cuando el retiro queda Pagado')
    if (v.estado === 'Anulada') throw conflicto('VentaAnulada', 'El retiro no se pagó: esta venta no se factura')
    if (v.estado === 'Rechazada') {
      await this.cambiar(v, { estado: 'PorEnviar' }, 'El punto pidió reenviar la compra a facturación.')
      v = (await uow.repos.ventas.obtener(ventaId))!
    }
    if (v.estado === 'PorEnviar') await this.enviar(ventaId)
    return this.vista((await uow.repos.ventas.obtener(ventaId))!)
  }

  /** Al arrancar: una pasada por las ventas que quedaron por enviar. */
  async recuperarAlArrancar(): Promise<number> {
    const pendientes = await this.deps.uow.repos.ventas.enEstado('PorEnviar')
    for (const v of pendientes) await this.enviar(v.id)
    return pendientes.length
  }

  /** Para pruebas y para el cierre ordenado. */
  async esperar(): Promise<void> {
    while (this.enCurso.size) await Promise.all([...this.enCurso.values()])
  }

  async vista(v: FilaVenta): Promise<VistaVenta> {
    const cobro = (await this.deps.uow.repos.cobros.obtener(v.cobroId))!
    const programa = (await this.deps.uow.repos.programas.obtener(cobro.programaId))!
    return vistaVenta(v, monedaDe(programa))
  }

  // ---------------------------------------------------------------------------------------------

  private enviar(ventaId: string): Promise<void> {
    const actual = this.enCurso.get(ventaId)
    if (actual) return actual
    const promesa = this.enviarUnaVez(ventaId)
      .catch((e: unknown) => log.error('El envío a facturación falló sin control', { error: e, venta: ventaId }))
      .finally(() => this.enCurso.delete(ventaId))
    this.enCurso.set(ventaId, promesa)
    return promesa
  }

  private async enviarUnaVez(ventaId: string): Promise<void> {
    const { uow, facturacion, reloj } = this.deps
    const v = await uow.repos.ventas.obtener(ventaId)
    if (v?.estado !== 'PorEnviar') return
    this.ultimoIntento.set(ventaId, reloj().getTime())
    const resultado = await facturacion.enviar(await this.armar(v))
    // Mientras se enviaba, otra instancia pudo terminarla: se decide sobre la venta de ahora
    const ahora = await uow.repos.ventas.obtener(ventaId)
    if (ahora?.estado !== 'PorEnviar') return
    await this.aplicar(ahora, resultado)
  }

  private async aplicar(v: FilaVenta, r: ResultadoEnvio): Promise<void> {
    const intentosEnvio = v.intentosEnvio + 1
    if (r.tipo === 'aceptada') {
      await this.cambiar(
        v,
        { estado: 'Enviada', enviadaEn: this.deps.reloj().toISOString(), referenciaExterna: r.referencia, ultimoError: null, intentosEnvio },
        `Facturación recibió la compra (${r.referencia}).`,
      )
    } else if (r.tipo === 'rechazada') {
      await this.cambiar(v, { estado: 'Rechazada', ultimoError: r.mensaje, intentosEnvio }, 'Facturación rechazó la compra; revisa los datos y reenvíala.')
    } else {
      await this.cambiar(v, { ultimoError: r.mensaje, intentosEnvio }, 'Facturación no respondió; la compra queda guardada para reintentar.')
    }
  }

  /** Cambia la venta con bloqueo optimista y deja su evento, en una transacción. */
  private async cambiar(v: FilaVenta, campos: CamposVenta, texto: string): Promise<boolean> {
    return this.deps.uow.transaccion(async (repos) => {
      if (!(await repos.ventas.actualizar(v.id, v.version, campos))) return false
      await repos.eventos.registrar({
        tipoEntidad: 'venta',
        idEntidad: v.id,
        estadoAnterior: campos.estado ? v.estado : null,
        estadoNuevo: campos.estado ?? null,
        detalle: { texto, intento: campos.intentosEnvio ?? v.intentosEnvio, ...(campos.ultimoError ? { error: campos.ultimoError } : {}) },
      })
      return true
    })
  }

  /** La solicitud para facturación: solo lo que Tatú sabe de la venta, sin nada que no haga falta. */
  private async armar(v: FilaVenta): Promise<SolicitudFactura> {
    const { repos } = this.deps.uow
    const cobro = (await repos.cobros.obtener(v.cobroId))!
    const [programa, punto, persona] = await Promise.all([repos.programas.obtener(cobro.programaId), repos.puntos.obtener(v.puntoId), repos.beneficiarios.obtener(v.beneficiarioId)])
    const entidad = await repos.entidades.obtener(programa!.entidadId)
    const nombre = await this.deps.liquidacion
      .personas([persona!.numeroDocumento])
      .then((m) => m.get(persona!.numeroDocumento)?.nombre ?? null)
      .catch(() => null)
    const moneda = monedaDe(programa!)
    return {
      idVenta: v.id,
      fecha: cobro.actualizadoEn,
      establecimiento: { puntoId: punto!.id, nombre: punto!.nombre, direccion: punto!.direccion },
      comprador: { tipoDocumento: persona!.tipoDocumento, numeroDocumento: persona!.numeroDocumento, nombre },
      venta: { valor: monto(v.valor, moneda), descripcion: v.descripcion },
      medioDePago: {
        tipo: 'subsidio',
        referenciaCobro: cobro.referencia,
        programa: { id: programa!.id, nombre: programa!.nombre },
        entidad: { nombre: entidad!.nombre, tipoDocumento: entidad!.tipoDocumento, documento: entidad!.documento },
        valorRetiro: monto(cobro.monto!, moneda),
        efectivoEntregado: monto(efectivoDe(cobro.monto!, v.valor), moneda),
      },
    }
  }
}
