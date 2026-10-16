// Carga datos de la API y, si se pide, los vuelve a consultar cada cierto tiempo.
import { useCallback, useEffect, useRef, useState } from 'react'

export interface Consulta<T> {
  datos: T | null
  error: unknown
  cargando: boolean
  recargar: () => void
}

interface Opciones<T> {
  /** Datos ya conocidos: se muestran de una vez, sin pantalla de carga. */
  inicial?: T | null
  /** Milisegundos entre consultas mientras `seguir` diga que sí. Sin él, se consulta una vez. */
  cadaMs?: number
  seguir?: (datos: T) => boolean
}

/**
 * `pedir` se vuelve a ejecutar cuando cambia `clave`. Una respuesta que llega después de cambiar de
 * clave o de desmontar se descarta.
 */
export function useConsulta<T>(clave: string | null, pedir: () => Promise<T>, opciones: Opciones<T> = {}): Consulta<T> {
  const { inicial = null, cadaMs, seguir } = opciones
  const [datos, setDatos] = useState<T | null>(inicial)
  const [error, setError] = useState<unknown>(null)
  const [pidiendo, setPidiendo] = useState(inicial === null)
  const [vuelta, setVuelta] = useState(0)
  const pedirRef = useRef(pedir)
  const seguirRef = useRef(seguir)
  useEffect(() => {
    pedirRef.current = pedir
    seguirRef.current = seguir
  })

  useEffect(() => {
    if (clave === null) return
    let vigente = true
    let temporizador: ReturnType<typeof setTimeout> | undefined

    const consultar = () => {
      pedirRef.current()
        .then((d) => {
          if (!vigente) return
          setDatos(d)
          setError(null)
          setPidiendo(false)
          if (cadaMs && seguirRef.current?.(d)) temporizador = setTimeout(consultar, cadaMs)
        })
        .catch((e: unknown) => {
          if (!vigente) return
          setError(e)
          setPidiendo(false)
          // Un corte de red mientras se sigue un pago no lo detiene: se vuelve a intentar
          if (cadaMs) temporizador = setTimeout(consultar, cadaMs)
        })
    }
    consultar()
    return () => {
      vigente = false
      clearTimeout(temporizador)
    }
  }, [clave, cadaMs, vuelta])

  const recargar = useCallback(() => {
    setPidiendo(true)
    setError(null)
    setVuelta((v) => v + 1)
  }, [])

  return { datos, error, cargando: pidiendo && datos === null, recargar }
}
