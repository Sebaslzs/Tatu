// Ciclo de vida del programa ya aprobado: pausar y reanudar (HU-18). El cierre y el tablero se
// suman en el módulo de cobros (HU-15, HU-17).
import type { LectorProgramas } from './lector.ts'
import type { Transiciones } from './transiciones.ts'
import type { VistaPrograma } from './vista.ts'

export interface DependenciasCiclo {
  lector: LectorProgramas
  transiciones: Transiciones
}

export class CicloPrograma {
  private readonly deps: DependenciasCiclo

  constructor(deps: DependenciasCiclo) {
    this.deps = deps
  }

  /** CA-18.01: deja de aceptar cobros nuevos sin revocar el permiso. */
  pausar(id: string): Promise<VistaPrograma> {
    return this.mover(id, 'Activo', 'Pausado', 'La entidad pausó el programa.')
  }

  /** CA-18.02: devuelve el programa a Activo. */
  reanudar(id: string): Promise<VistaPrograma> {
    return this.mover(id, 'Pausado', 'Activo', 'La entidad reanudó el programa.')
  }

  private async mover(id: string, desde: 'Activo' | 'Pausado', hacia: 'Activo' | 'Pausado', texto: string): Promise<VistaPrograma> {
    const { lector, transiciones } = this.deps
    const p = await lector.exigir(id)
    transiciones.exigirEstado(p, desde)
    const cambiado = await transiciones.aplicar(p, hacia, {}, { texto })
    return lector.vista(cambiado ?? (await lector.exigir(id)))
  }
}
