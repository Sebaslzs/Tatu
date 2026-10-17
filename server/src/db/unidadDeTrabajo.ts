// Agrupa los repositorios y abre transacciones: los servicios dependen de esta interfaz,
// no de Drizzle (inversión de dependencias).
import type { Db } from './conexion.ts'
import { repoBeneficiarios, type RepoBeneficiarios } from './repositorios/beneficiarios.ts'
import { repoBloqueos, type RepoBloqueos } from './repositorios/bloqueos.ts'
import { repoCobros, type RepoCobros } from './repositorios/cobros.ts'
import { repoCuentas, type RepoCuentas } from './repositorios/cuentas.ts'
import { repoEntidades, type RepoEntidades } from './repositorios/entidades.ts'
import { repoEventos, type RepoEventos } from './repositorios/eventos.ts'
import { repoProgramas, type RepoProgramas } from './repositorios/programas.ts'
import { repoPuntos, type RepoPuntos } from './repositorios/puntos.ts'

export interface Repos {
  entidades: RepoEntidades
  programas: RepoProgramas
  puntos: RepoPuntos
  beneficiarios: RepoBeneficiarios
  cuentas: RepoCuentas
  cobros: RepoCobros
  bloqueos: RepoBloqueos
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
    beneficiarios: repoBeneficiarios(db),
    cuentas: repoCuentas(db),
    cobros: repoCobros(db),
    bloqueos: repoBloqueos(db),
    eventos: repoEventos(db),
  }
}

export function crearUnidadDeTrabajo(db: Db): UnidadDeTrabajo {
  return {
    repos: crearRepos(db),
    transaccion: (trabajo) => db.transaction((tx) => trabajo(crearRepos(tx))),
  }
}
