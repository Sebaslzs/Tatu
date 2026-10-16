// Agrupa los repositorios y abre transacciones: los servicios dependen de esta interfaz,
// no de Drizzle (inversión de dependencias).
import type { Db } from './conexion.ts'
import { repoEntidades, type RepoEntidades } from './repositorios/entidades.ts'
import { repoEventos, type RepoEventos } from './repositorios/eventos.ts'
import { repoProgramas, type RepoProgramas } from './repositorios/programas.ts'
import { repoPuntos, type RepoPuntos } from './repositorios/puntos.ts'

export interface Repos {
  entidades: RepoEntidades
  programas: RepoProgramas
  puntos: RepoPuntos
  eventos: RepoEventos
}

export interface UnidadDeTrabajo {
  repos: Repos
  /** Corre `trabajo` en una transacción: todo se guarda o nada. */
  transaccion<T>(trabajo: (repos: Repos) => Promise<T>): Promise<T>
}

function crearRepos(db: Db): Repos {
  return {
    entidades: repoEntidades(db),
    programas: repoProgramas(db),
    puntos: repoPuntos(db),
    eventos: repoEventos(db),
  }
}

export function crearUnidadDeTrabajo(db: Db): UnidadDeTrabajo {
  return {
    repos: crearRepos(db),
    transaccion: (trabajo) => db.transaction((tx) => trabajo(crearRepos(tx))),
  }
}
