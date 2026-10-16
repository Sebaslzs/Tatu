// El programa y su tablero, consultados cada 5 s mientras la vista está abierta (wireframe 04).
// GET /programas/:id/tablero todavía responde 501 en la API: entonces `tablero` es null y la
// vista muestra lo que sí trae el programa.
import { esNoImplementado, http } from '@/api/http'
import type { Programa, Tablero } from '@/api/tipos'
import { usePolling } from '@/api/usePolling'
import { tienePermiso } from '@/lib/pantallas'

export interface DatosPrograma {
  programa: Programa
  tablero: Tablero | null
  /** La API todavía no tiene el tablero (501). */
  tableroPendiente: boolean
}

export async function cargarPrograma(id: string): Promise<DatosPrograma> {
  const programa = await http.get<Programa>(`/programas/${id}`)
  if (!tienePermiso(programa.estado)) return { programa, tablero: null, tableroPendiente: false }
  try {
    const tablero = await http.get<Tablero>(`/programas/${id}/tablero`)
    return { programa: tablero.programa ?? programa, tablero, tableroPendiente: false }
  } catch (e) {
    if (esNoImplementado(e)) return { programa, tablero: null, tableroPendiente: true }
    throw e
  }
}

export function useTablero(id: string, intervalo: number | null = 5000) {
  return usePolling(() => cargarPrograma(id), intervalo, true, { clave: id })
}
