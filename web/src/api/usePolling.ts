// Consulta periódica del estado (AD-16): se detiene al salir de la vista y hace pausa con la
// pestaña oculta. Tomado del piloto (rama produccion).
import { useCallback, useEffect, useRef, useState } from 'react'
import { mensajeDeError } from './http'

export interface Consulta<T> {
  datos: T | undefined
  error: string | null
  cargando: boolean
  recargar: () => Promise<T | undefined>
  /** Para poner en pantalla la respuesta de un POST sin esperar la siguiente consulta. */
  setDatos: (d: T) => void
}

/**
 * Consulta `fn` al montar y, mientras `activo` sea verdadero (o devuelva verdadero para los datos),
 * cada `intervalo` ms. Deja de consultar cuando pasa `maxMs`. `clave` vuelve a cargar desde cero.
 */
export function usePolling<T>(
  fn: () => Promise<T>,
  intervalo: number | null,
  activo: boolean | ((datos: T | undefined) => boolean) = true,
  opciones: { clave?: unknown; maxMs?: number } = {},
): Consulta<T> {
  const { clave, maxMs } = opciones
  const [datos, setDatos] = useState<T>()
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  const fnRef = useRef(fn)
  useEffect(() => {
    fnRef.current = fn
  })
  const vivo = useRef(true)
  const enCurso = useRef<Promise<T | undefined> | null>(null)

  const recargar = useCallback(async () => {
    if (enCurso.current) return enCurso.current
    const p = (async () => {
      try {
        const d = await fnRef.current()
        if (vivo.current) {
          setDatos(() => d)
          setError(null)
        }
        return d
      } catch (e) {
        if (vivo.current) setError(mensajeDeError(e))
        return undefined
      } finally {
        if (vivo.current) setCargando(false)
        enCurso.current = null
      }
    })()
    enCurso.current = p
    return p
  }, [])

  useEffect(() => {
    vivo.current = true
    void recargar()
    return () => {
      vivo.current = false
    }
  }, [clave, recargar])

  const activoAhora = typeof activo === 'function' ? activo(datos) : activo

  useEffect(() => {
    if (!activoAhora || !intervalo) return
    const inicio = Date.now()
    let temporizador: ReturnType<typeof setTimeout> | undefined

    const programar = () => {
      temporizador = setTimeout(async () => {
        if (maxMs && Date.now() - inicio > maxMs) return
        if (document.visibilityState === 'visible') await recargar()
        programar()
      }, intervalo)
    }
    const alVolver = () => {
      if (document.visibilityState === 'visible') void recargar()
    }

    programar()
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      clearTimeout(temporizador)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [activoAhora, intervalo, maxMs, recargar, clave])

  const ponerDatos = useCallback((d: T) => setDatos(() => d), [])

  return { datos, error, cargando, recargar, setDatos: ponerDatos }
}
