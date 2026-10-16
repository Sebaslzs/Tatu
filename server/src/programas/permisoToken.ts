// El token del permiso (HU-06): se usa para pagar y, si el banco ya no lo acepta, se rota y se
// reintenta una sola vez. Con un candado por programa para la concurrencia (CA-06.01).
import type { Reloj } from '../comun/fechas.ts'
import { log } from '../comun/log.ts'
import { ErrorOpenPayments } from '../comun/openPayments.ts'
import type { FilaPrograma } from '../db/repositorios/programas.ts'
import type { UnidadDeTrabajo } from '../db/unidadDeTrabajo.ts'
import type { LectorProgramas } from './lector.ts'
import type { PuertoPermisos } from './puertos.ts'

/** CA-06.02: el banco ya no acepta el token ni su rotación; la entidad tiene que renovar el permiso. */
export class PermisoVencido extends Error {
  constructor() {
    super('El permiso venció: apruébalo de nuevo')
  }
}

export interface DependenciasPermisoToken {
  uow: UnidadDeTrabajo
  lector: LectorProgramas
  permisos: PuertoPermisos
  reloj: Reloj
}

export class ServicioPermisoToken {
  private readonly deps: DependenciasPermisoToken
  /** Una rotación a la vez por programa: las demás peticiones esperan la misma. */
  private readonly rotaciones = new Map<string, Promise<string>>()

  constructor(deps: DependenciasPermisoToken) {
    this.deps = deps
  }

  /** Corre `fn` con el token del programa; ante un token vencido, rota y reintenta una sola vez (CA-06.01). */
  async conToken<T>(programaId: string, fn: (token: string, programa: FilaPrograma) => Promise<T>): Promise<T> {
    const programa = await this.deps.lector.exigir(programaId)
    if (!programa.tokenAcceso || programa.permisoVencidoEn) throw new PermisoVencido()
    try {
      return await fn(programa.tokenAcceso, programa)
    } catch (e) {
      if (!this.esTokenVencido(e)) throw e
      const token = await this.rotar(programaId, programa.tokenAcceso)
      try {
        return await fn(token, await this.deps.lector.exigir(programaId))
      } catch (e2) {
        if (!this.esTokenVencido(e2)) throw e2
        await this.marcarPermisoVencido(programaId)
        throw new PermisoVencido()
      }
    }
  }

  /** Rota el token ya, sin esperar a que falle (renovación en segundo plano). */
  async rotarPermiso(programaId: string): Promise<string> {
    const programa = await this.deps.lector.exigir(programaId)
    if (!programa.tokenAcceso || programa.permisoVencidoEn) throw new PermisoVencido()
    return this.rotar(programaId, programa.tokenAcceso)
  }

  private esTokenVencido(e: unknown): boolean {
    return e instanceof ErrorOpenPayments && e.tipo === 'TokenVencido'
  }

  private rotar(programaId: string, tokenViejo: string): Promise<string> {
    const enCurso = this.rotaciones.get(programaId)
    if (enCurso) return enCurso
    const promesa = this.rotarUnaVez(programaId, tokenViejo).finally(() => this.rotaciones.delete(programaId))
    this.rotaciones.set(programaId, promesa)
    return promesa
  }

  private async rotarUnaVez(programaId: string, tokenViejo: string): Promise<string> {
    const { lector, uow, permisos } = this.deps
    const actual = await lector.exigir(programaId)
    // Otra petición ya lo rotó: se usa el nuevo
    if (actual.tokenAcceso && actual.tokenAcceso !== tokenViejo) return actual.tokenAcceso
    if (!actual.tokenAcceso || !actual.urlGestion || actual.permisoVencidoEn) throw new PermisoVencido()
    try {
      const nuevo = await permisos.rotarToken({ urlGestion: actual.urlGestion, token: actual.tokenAcceso })
      await uow.transaccion(async (repos) => {
        await repos.programas.actualizar(programaId, { tokenAcceso: nuevo.token, urlGestion: nuevo.urlGestion }, actual.estado)
        await repos.eventos.registrar({
          tipoEntidad: 'programa',
          idEntidad: programaId,
          detalle: { texto: 'Se rotó el token del permiso.', expiresIn: nuevo.expiraEnSeg ?? null },
        })
      })
      return nuevo.token
    } catch (e) {
      log.warn('No se pudo rotar el token', { error: e, programa: programaId })
      // Sin respuesta (red, 5xx): no se sabe si el permiso murió; se reintenta en la próxima vuelta
      if (e instanceof ErrorOpenPayments && e.tipo === 'SinRespuesta') throw e
      await this.marcarPermisoVencido(programaId)
      throw new PermisoVencido()
    }
  }

  /** El banco ya no acepta el token ni su rotación: queda así hasta que la entidad lo renueve. */
  private async marcarPermisoVencido(programaId: string): Promise<void> {
    const { uow, lector, reloj } = this.deps
    await uow.transaccion(async (repos) => {
      const programa = await lector.exigir(programaId, repos)
      if (programa.permisoVencidoEn || (programa.estado !== 'Activo' && programa.estado !== 'Pausado')) return
      await repos.programas.actualizar(programaId, { permisoVencidoEn: reloj().toISOString() }, programa.estado)
      await repos.eventos.registrar({
        tipoEntidad: 'programa',
        idEntidad: programaId,
        detalle: { texto: 'El permiso venció en el banco: hay que renovarlo para seguir pagando.', permisoVencido: true },
        actor: 'banco',
      })
    })
  }
}
