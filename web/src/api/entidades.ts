// Entidades financiadoras (GET /entidades). Cambian poco: se piden una vez por carga de la app.
import { useEffect, useState } from 'react'
import { http } from './http'
import type { Entidad } from './tipos'

let cache: Promise<Entidad[]> | null = null

export function cargarEntidades(): Promise<Entidad[]> {
  cache ??= http.get<Entidad[]>('/entidades').catch((e: unknown) => {
    cache = null
    throw e
  })
  return cache
}

/** La lista de entidades; `null` mientras llega o si la API no responde. */
export function useEntidades(): Entidad[] | null {
  const [entidades, setEntidades] = useState<Entidad[] | null>(null)
  useEffect(() => {
    let vivo = true
    cargarEntidades()
      .then((l) => vivo && setEntidades(l))
      .catch(() => vivo && setEntidades(null))
    return () => {
      vivo = false
    }
  }, [])
  return entidades
}

/** El nombre de una entidad por su id, para el encabezado. */
export function useNombreEntidad(id: string | undefined): string | undefined {
  const entidades = useEntidades()
  return id ? entidades?.find((e) => e.id === id)?.nombre : undefined
}
