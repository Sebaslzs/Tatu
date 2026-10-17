// El token del permiso (HU-06): se usa para pagar y, si el banco ya no lo acepta, se rota y se
// reintenta una sola vez (CA-06.01).
//
// Una sola puerta para rotar: la renovación en segundo plano y la rotación a demanda pasan por el
// mismo candado de la base (no uno en memoria), así dos instancias de Vercel, o Vercel y un servidor
// local, nunca rotan el mismo token a la vez. Si dos rotaran a la vez, el banco aceptaría la primera
// y rechazaría la segunda (ese token ya estaba reemplazado), y el permiso se daría por vencido sin
// estarlo. Por lo mismo, antes de marcar el permiso vencido se relee la base: si otro ya guardó un
// token nuevo, se usa ese.
import type { Reloj } from '../comun/fechas.ts'
import { log } from '../comun/log.ts'
import { ErrorOpenPayments } from '../comun/openPayments.ts'
import type { FilaPrograma } from '../db/repositorios/programas.ts'
import type { UnidadDeTrabajo } from '../db/unidadDeTrabajo.ts'
import { CANDADO_ROTACION, sinCandado, type Candado } from './candados.ts'
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
  /** Candado de la base compartido con la renovación; sin él (pruebas, PGlite) corre directo. */
  candado?: Candado
  /** Mientras otra instancia rota: cada cuánto y cuántas veces se relee la base buscando el token nuevo. */
  esperaRotacion?: { cadaMs: number; intentos: number }
}

const ESPERA_POR_DEFECTO = { cadaMs: 300, intentos: 10 }

export class ServicioPermisoToken {
  private readonly deps: DependenciasPermisoToken
  /** Dentro de una instancia, una rotación a la vez por programa: las demás esperan la misma. */
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
        // Si mientras tanto otro rotó otra vez, el permiso sigue vivo: se reintenta en la próxima vuelta
        const actual = await this.deps.lector.exigir(programaId)
        if (actual.tokenAcceso && actual.tokenAcceso !== token) throw this.reintentarLuego()
        await this.marcarPermisoVencido(programaId)
        throw new PermisoVencido()
      }
    }
  }

  /**
   * Para lecturas (lo gastado del tablero): usa el token actual y nunca rota. Si el banco no lo
   * acepta, el error sube y quien lee usa su respaldo; la rotación la hace quien paga o la renovación.
   */
  async conTokenSinRotar<T>(programaId: string, fn: (token: string, programa: FilaPrograma) => Promise<T>): Promise<T> {
    const programa = await this.deps.lector.exigir(programaId)
    if (!programa.tokenAcceso || programa.permisoVencidoEn) throw new PermisoVencido()
    return fn(programa.tokenAcceso, programa)
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

  /** «Sin respuesta»: el cobro queda Pagando y se reconcilia; el permiso no se toca. */
  private reintentarLuego(): ErrorOpenPayments {
    return new ErrorOpenPayments('SinRespuesta', undefined, undefined, 'Otro proceso está rotando el token del permiso')
  }

  private rotar(programaId: string, tokenViejo: string): Promise<string> {
    const enCurso = this.rotaciones.get(programaId)
    if (enCurso) return enCurso
    const promesa = this.rotarEntreInstancias(programaId, tokenViejo).finally(() => this.rotaciones.delete(programaId))
    this.rotaciones.set(programaId, promesa)
    return promesa
  }

  /** Con el candado de la base, rota; si otra instancia lo tiene, espera a que guarde el token nuevo. */
  private async rotarEntreInstancias(programaId: string, tokenViejo: string): Promise<string> {
    const candado = this.deps.candado ?? sinCandado
    const rotado = await candado(CANDADO_ROTACION, () => this.rotarUnaVez(programaId, tokenViejo))
    return rotado ?? this.esperarTokenNuevo(programaId, tokenViejo)
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
      // Antes de dar el permiso por vencido: si otro guardó un token nuevo mientras tanto, el permiso vive
      const despues = await lector.exigir(programaId)
      if (despues.tokenAcceso && despues.tokenAcceso !== tokenViejo) return despues.tokenAcceso
      // Sin respuesta (red, 5xx): no se sabe si el permiso murió; se reintenta en la próxima vuelta.
      // Llaves distintas: el permiso es de otro servidor de Tatú y sigue vivo allá; no se marca.
      if (e instanceof ErrorOpenPayments && (e.tipo === 'SinRespuesta' || e.tipo === 'LlavesDistintas')) throw e
      await this.marcarPermisoVencido(programaId)
      throw new PermisoVencido()
    }
  }

  /** Otra instancia tiene el candado: se relee la base hasta ver el token que guarde. */
  private async esperarTokenNuevo(programaId: string, tokenViejo: string): Promise<string> {
    const { cadaMs, intentos } = this.deps.esperaRotacion ?? ESPERA_POR_DEFECTO
    for (let i = 0; i < intentos; i++) {
      await new Promise((listo) => setTimeout(listo, cadaMs))
      const actual = await this.deps.lector.exigir(programaId)
      if (actual.permisoVencidoEn) throw new PermisoVencido()
      if (actual.tokenAcceso && actual.tokenAcceso !== tokenViejo) return actual.tokenAcceso
    }
    throw this.reintentarLuego()
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
