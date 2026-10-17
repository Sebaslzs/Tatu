// La cuenta regresiva del PIN: 120 s desde que el punto pidió el cobro (CA-11.04). El plazo lo manda la
// API (`confirmarAntesDe`); al vencer, la API rechaza el cobro cuando se vuelve a consultar.
import { useEffect, useRef, useState } from 'react'

const faltan = (hasta: string | null) => (hasta ? Math.max(0, (Date.parse(hasta) - Date.now()) / 1000) : null)

/** Segundos que faltan hasta `hasta` (ISO). Llama `alTerminar` una sola vez al llegar a cero. */
export function useCuentaRegresiva(hasta: string | null, alTerminar?: () => void): number | null {
  // Cada tic vuelve a pintar; lo que falta se calcula al pintar
  const [, setTic] = useState(0)
  const avisado = useRef(false)
  const alTerminarRef = useRef(alTerminar)
  useEffect(() => {
    alTerminarRef.current = alTerminar
  })

  useEffect(() => {
    if (!hasta) return
    avisado.current = false
    const t = setInterval(() => {
      setTic((n) => n + 1)
      if (faltan(hasta) === 0 && !avisado.current) {
        avisado.current = true
        alTerminarRef.current?.()
      }
    }, 250)
    return () => clearInterval(t)
  }, [hasta])

  return faltan(hasta)
}
