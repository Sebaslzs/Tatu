// Lectura de programas: buscar uno que debe existir y convertirlo en lo que la API muestra.
import { noEncontrado } from '../comun/errores.ts'
import type { FilaPrograma } from '../db/repositorios/programas.ts'
import type { Repos, UnidadDeTrabajo } from '../db/unidadDeTrabajo.ts'
import { vistaPrograma, type VistaPrograma } from './vista.ts'

export class LectorProgramas {
  private readonly uow: UnidadDeTrabajo

  constructor(uow: UnidadDeTrabajo) {
    this.uow = uow
  }

  /** El programa o 404. `repos` permite leer dentro de una transacción. */
  async exigir(id: string, repos: Repos = this.uow.repos): Promise<FilaPrograma> {
    const programa = await repos.programas.obtener(id)
    if (!programa) throw noEncontrado('Ese programa no existe')
    return programa
  }

  async vista(programa: FilaPrograma, repos: Repos = this.uow.repos): Promise<VistaPrograma> {
    return vistaPrograma(programa, await this.categorias(programa.id, repos))
  }

  async vistas(programas: readonly FilaPrograma[]): Promise<VistaPrograma[]> {
    const categorias = await this.uow.repos.programas.categoriasDe(programas.map((p) => p.id))
    return programas.map((p) => vistaPrograma(p, categorias.get(p.id) ?? []))
  }

  async categorias(id: string, repos: Repos = this.uow.repos): Promise<string[]> {
    return (await repos.programas.categoriasDe([id])).get(id) ?? []
  }
}
