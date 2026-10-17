// Renovación del token del permiso (HU-06, hallazgo D-35 del piloto). En la Test Wallet el token dura
// 10 minutos y el banco no acepta rotar uno que venció hace rato: si nadie lo rota antes, el primer
// cobro después de esos 10 minutos falla con PermisoVencido. Mientras la API recibe pedidos, cada
// TOKEN_RENOVAR_CADA_SEG (4 min) se rota el token de cada programa Activo o Pausado.
import { log } from '../comun/log.ts'
import { CANDADO_RENOVACION, sinCandado, type Candado } from './candados.ts'
import type { UnidadDeTrabajo } from '../db/unidadDeTrabajo.ts'
import { PermisoVencido, type ServicioPermisoToken } from './permisoToken.ts'

export interface ResultadoRenovacion {
  renovados: number
  vencidos: number
  fallidos: number
}

export interface DependenciasRenovacion {
  uow: UnidadDeTrabajo
  token: ServicioPermisoToken
  /** Candado de la base: una sola vuelta de renovación a la vez entre todos los servidores. */
  candado?: Candado
}

export class RenovacionPermisos {
  private readonly deps: DependenciasRenovacion

  constructor(deps: DependenciasRenovacion) {
    this.deps = deps
  }

  /**
   * Una vuelta: rota el token de cada programa con permiso vigente. Un fallo no detiene a los demás.
   * Si otro servidor ya está renovando (tiene el candado), esta vuelta no hace nada.
   */
  async renovarTodos(): Promise<ResultadoRenovacion> {
    const candado = this.deps.candado ?? sinCandado
    return (await candado(CANDADO_RENOVACION, () => this.vuelta())) ?? { renovados: 0, vencidos: 0, fallidos: 0 }
  }

  private async vuelta(): Promise<ResultadoRenovacion> {
    const vigentes = await this.deps.uow.repos.programas.conPermisoVigente()
    const r: ResultadoRenovacion = { renovados: 0, vencidos: 0, fallidos: 0 }
    for (const { id } of vigentes) {
      try {
        await this.deps.token.rotarPermiso(id)
        r.renovados += 1
      } catch (e) {
        if (e instanceof PermisoVencido) {
          r.vencidos += 1
          log.warn('El permiso venció en el banco: la entidad tiene que aprobarlo de nuevo', { programa: id })
        } else {
          // Sin respuesta del banco: se intenta otra vez en la próxima vuelta
          r.fallidos += 1
          log.warn('No se pudo renovar el token; se reintenta en la próxima vuelta', { error: e, programa: id })
        }
      }
    }
    return r
  }

  /** Para un proceso prendido (main.ts): una vuelta al arrancar y luego cada `cadaMs`. Devuelve cómo detenerlo. */
  iniciar(cadaMs: number): () => void {
    let corriendo = false
    const vuelta = async () => {
      if (corriendo) return
      corriendo = true
      try {
        const r = await this.renovarTodos()
        if (r.renovados + r.vencidos + r.fallidos) log.info('Renovación de tokens', { ...r })
      } catch (e) {
        log.warn('Falló la renovación de tokens', { error: e })
      } finally {
        corriendo = false
      }
    }
    const inicial = setTimeout(() => void vuelta(), 2000)
    const reloj = setInterval(() => void vuelta(), cadaMs)
    inicial.unref()
    reloj.unref()
    return () => {
      clearTimeout(inicial)
      clearInterval(reloj)
    }
  }
}
