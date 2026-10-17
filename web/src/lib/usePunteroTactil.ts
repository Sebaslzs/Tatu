// El puntero principal es un dedo (celular, tablet o computador con pantalla táctil). El punto lo usa
// para mostrar el teclado del PIN también en pantallas grandes: una tablet en horizontal pasa de
// 960 px y no tiene teclado físico. Mismo patrón que useEnComputador.
import { useSyncExternalStore } from 'react'

const TACTIL = '(pointer: coarse)'

const suscribir = (aviso: () => void) => {
  const mq = window.matchMedia(TACTIL)
  mq.addEventListener('change', aviso)
  return () => mq.removeEventListener('change', aviso)
}

export const usePunteroTactil = () => useSyncExternalStore(suscribir, () => window.matchMedia(TACTIL).matches)
