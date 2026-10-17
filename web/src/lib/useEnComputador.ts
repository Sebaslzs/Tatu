// Desde 960 px de ancho el punto usa sus pantallas de computador, como en el prototipo.
import { useSyncExternalStore } from 'react'

const COMPUTADOR = '(min-width: 960px)'

const suscribir = (aviso: () => void) => {
  const mq = window.matchMedia(COMPUTADOR)
  mq.addEventListener('change', aviso)
  return () => mq.removeEventListener('change', aviso)
}

export const useEnComputador = () => useSyncExternalStore(suscribir, () => window.matchMedia(COMPUTADOR).matches)
