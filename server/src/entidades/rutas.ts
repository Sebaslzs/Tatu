// /entidades · Lectura de las entidades financiadoras para el selector de la web (HU-01).
import { Router } from 'express'
import type { RepoEntidades } from '../db/repositorios/entidades.ts'

export function rutasEntidades(entidades: RepoEntidades): Router {
  const r = Router()

  r.get('/', async (_req, res) => {
    const lista = await entidades.listar()
    res.json(lista.filter((e) => e.estado === 'Activa').map((e) => ({ id: e.id, nombre: e.nombre, tipo: e.tipo })))
  })

  return r
}
