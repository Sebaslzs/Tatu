// Cambios de estado del programa: una sola puerta para que cada transición sea válida, atómica y
// deje su evento (HU-16). También aplica el vencimiento de la aprobación (HU-05).
import { conflicto } from '../comun/errores.ts'
import type { Reloj } from '../comun/fechas.ts'
import { log } from '../comun/log.ts'
import type { CamposPrograma, FilaPrograma } from '../db/repositorios/programas.ts'
import type { Actor } from '../db/repositorios/eventos.ts'
import type { UnidadDeTrabajo } from '../db/unidadDeTrabajo.ts'
import { puedeTransicionar, type EstadoPrograma } from './estados.ts'
import type { LectorProgramas } from './lector.ts'
import type { PuertoPermisos } from './puertos.ts'
import { aprobacionVencida } from './reglas.ts'

/** Lo que se borra cuando una aprobación termina (aprobada, rechazada, vencida o cancelada). */
export const SIN_TEMPORALES = {
  aprobacionSolicitadaEn: null,
  uriContinuacion: null,
  tokenContinuacion: null,
  nonceCliente: null,
  nonceCierre: null,
} satisfies CamposPrograma

export interface DependenciasTransiciones {
  uow: UnidadDeTrabajo
  lector: LectorProgramas
  permisos: PuertoPermisos
  reloj: Reloj
  /** CA-01.08: cuánto espera una aprobación antes de volver a Borrador, en ms. */
  aprobacionTtlMs: number
}

export class Transiciones {
  private readonly deps: DependenciasTransiciones

  constructor(deps: DependenciasTransiciones) {
    this.deps = deps
  }

  /** El programa debe estar en alguno de estos estados, o 409 `EstadoNoPermite`. */
  exigirEstado(programa: FilaPrograma, ...estados: EstadoPrograma[]): void {
    if (!estados.includes(programa.estado)) {
      throw conflicto('EstadoNoPermite', `El programa está en ${programa.estado}; esta acción pide ${estados.join(' o ')}`)
    }
  }

  /**
   * Cambia de estado si la transición existe y nadie lo cambió antes (bloqueo optimista). Devuelve
   * el programa actualizado, o undefined si otra petición ganó.
   */
  async aplicar(
    programa: FilaPrograma,
    hacia: EstadoPrograma,
    campos: CamposPrograma,
    detalle: Record<string, unknown>,
    actor: Actor = 'entidad',
  ): Promise<FilaPrograma | undefined> {
    if (!puedeTransicionar(programa.estado, hacia)) {
      throw conflicto('TransicionNoPermitida', `El programa no puede pasar de ${programa.estado} a ${hacia}`)
    }
    return this.deps.uow.transaccion(async (repos) => {
      const cambiado = await repos.programas.actualizar(programa.id, { ...campos, estado: hacia }, programa.estado)
      if (cambiado) {
        await repos.eventos.registrar({
          tipoEntidad: 'programa',
          idEntidad: programa.id,
          estadoAnterior: programa.estado,
          estadoNuevo: hacia,
          detalle,
          actor,
        })
      }
      return cambiado
    })
  }

  /** CA-01.08 / CA-05.02: una aprobación vencida vuelve a Borrador, con su evento del sistema. */
  async aplicarVencimiento(programa: FilaPrograma): Promise<FilaPrograma> {
    if (!aprobacionVencida(programa, this.deps.reloj(), this.deps.aprobacionTtlMs)) return programa
    await this.cancelarPendiente(programa)
    const cambiado = await this.aplicar(
      programa,
      'Borrador',
      SIN_TEMPORALES,
      { texto: 'La aprobación venció sin respuesta.', resultado: 'vencido' },
      'sistema',
    )
    return cambiado ?? this.deps.lector.exigir(programa.id)
  }

  /** `grant.cancel` de una aprobación pendiente; si el servidor ya no la tiene, da igual (best-effort). */
  async cancelarPendiente(programa: FilaPrograma): Promise<void> {
    if (!programa.uriContinuacion || !programa.tokenContinuacion) return
    try {
      await this.deps.permisos.cancelarPermisoPendiente({
        uriContinuacion: programa.uriContinuacion,
        tokenContinuacion: programa.tokenContinuacion,
      })
    } catch (e) {
      log.warn('No se pudo cancelar el permiso pendiente', { error: e, programa: programa.id })
    }
  }
}
