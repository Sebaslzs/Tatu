// Confirmar con PIN y cancelar (HU-11): el PIN lo valida la liquidación y la plataforma no lo guarda
// (CA-11.06). Aquí está el punto de no retorno: guardar Pagando antes de llamar a Open Payments.
import { conflicto, ErrorApi } from '../comun/errores.ts'
import type { Reloj } from '../comun/fechas.ts'
import type { FilaCobro } from '../db/repositorios/cobros.ts'
import { actorBeneficiario } from '../db/repositorios/eventos.ts'
import type { UnidadDeTrabajo } from '../db/unidadDeTrabajo.ts'
import type { PuertoLiquidacion } from '../liquidacion/contrato.ts'
import { mensajePinIncorrecto } from './mensajes.ts'
import { actorDe, type MovimientosCobro } from './movimientos.ts'
import type { PagadorCobros } from './pagador.ts'
import { rn07EvaluarPin, rn12Vencio } from './reglas.ts'
import type { VistaCobro, VistasCobro } from './vista.ts'

export interface DependenciasConfirmacion {
  uow: UnidadDeTrabajo
  liquidacion: PuertoLiquidacion
  movimientos: MovimientosCobro
  vistas: VistasCobro
  pagador: PagadorCobros
  reloj: Reloj
  confirmacionTtlSeg: number
  pinMaxIntentos: number
  pinBloqueoMin: number
}

export class ConfirmacionCobro {
  private readonly deps: DependenciasConfirmacion

  constructor(deps: DependenciasConfirmacion) {
    this.deps = deps
  }

  /** CA-11.04 (RN-12): un PorConfirmar vencido pasa a Rechazado por tiempo agotado. Se evalúa al consultar, sin worker. */
  async aplicarVencimiento(c: FilaCobro): Promise<FilaCobro> {
    const { reloj, confirmacionTtlSeg, movimientos } = this.deps
    if (rn12Vencio({ estado: c.estado, desde: c.creadoEn, ahora: reloj(), ttlSeg: confirmacionTtlSeg })) {
      await movimientos.mover(c, 'Rechazado', { motivoRechazo: 'TiempoAgotado' })
      return movimientos.exigir(c.id)
    }
    return c
  }

  /** CA-11.01 a CA-11.03. Responde 202 al pasar a Pagando; 200 si no hay nada que hacer; 422 con PIN incorrecto. */
  async confirmar(id: string, pin: string): Promise<{ status: number; cobro: VistaCobro }> {
    const { movimientos, vistas, uow, liquidacion, pagador, reloj } = this.deps
    let c = await this.aplicarVencimiento(await movimientos.exigir(id))
    const sinCambios = async () => ({ status: 200, cobro: await vistas.una(c) })
    if (c.estado === 'Pagando' || c.estado === 'Pagado') return sinCambios()
    if (c.estado !== 'PorConfirmar') {
      if (c.estado === 'Rechazado' || c.estado === 'Fallido') return sinCambios()
      throw conflicto('EstadoNoPermite', 'Este cobro no está esperando el PIN')
    }

    const persona = (await uow.repos.beneficiarios.obtener(c.beneficiarioId))!
    const valido = await liquidacion.validarPin(persona.numeroDocumento, pin)

    // Mientras se validaba, otra petición pudo cambiarlo
    c = await movimientos.exigir(id)
    if (c.estado !== 'PorConfirmar') return sinCambios()

    const { pinMaxIntentos, pinBloqueoMin } = this.deps
    const r = rn07EvaluarPin({ valido, intentosPrevios: c.intentosPin, maxIntentos: pinMaxIntentos })
    if (r.resultado === 'incorrecto') {
      if (!(await uow.repos.cobros.actualizar(c.id, c.version, { intentosPin: r.intentos }))) {
        throw conflicto('VersionCambio', 'El cobro cambió; vuelve a intentarlo')
      }
      throw new ErrorApi(422, 'PinIncorrecto', mensajePinIncorrecto(r.restantes))
    }
    if (r.resultado === 'bloqueado') {
      // CA-11.03 (RN-07): el cobro se rechaza y la persona queda bloqueada en este programa, todo en una transacción
      const hasta = new Date(reloj().getTime() + pinBloqueoMin * 60_000).toISOString()
      await movimientos.mover(c, 'Rechazado', { motivoRechazo: 'PinBloqueado', intentosPin: r.intentos }, {}, actorBeneficiario(c.beneficiarioId), (repos) =>
        repos.bloqueos.bloquear({ programaId: c.programaId, beneficiarioId: c.beneficiarioId, cobroId: c.id, hasta }),
      )
      return { status: 200, cobro: await vistas.una(await movimientos.exigir(id)) }
    }

    // Punto de no retorno (CA-12.01). Si la versión ya cambió, no se paga dos veces (CA-14.03).
    if (await movimientos.mover(c, 'Pagando', {}, {}, actorBeneficiario(c.beneficiarioId))) pagador.disparar(c.id)
    return { status: 202, cobro: await vistas.una(await movimientos.exigir(id)) }
  }

  /** CA-11.05: «Cancelar cobro»: PorConfirmar → Rechazado con Cancelado. */
  async cancelar(id: string): Promise<VistaCobro> {
    const { movimientos, vistas } = this.deps
    const c = await this.aplicarVencimiento(await movimientos.exigir(id))
    if (c.estado !== 'PorConfirmar') throw conflicto('EstadoNoPermite', 'Solo se cancela un cobro que espera el PIN')
    if (!(await movimientos.mover(c, 'Rechazado', { motivoRechazo: 'Cancelado' }, {}, actorDe(c)))) {
      throw conflicto('VersionCambio', 'El cobro cambió; recarga')
    }
    return vistas.una(await movimientos.exigir(id))
  }
}
