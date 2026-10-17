// Modo oscuro: index.html pone `data-tema` en <html> antes de pintar (lo guardado o, si no hay,
// el sistema). Aquí solo se cambia, se recuerda y, mientras la persona no haya elegido, se sigue
// al sistema también en vivo.
import { useCallback, useEffect, useState } from 'react'

export type NombreTema = 'claro' | 'oscuro'

/** Misma clave que lee el script de index.html. */
const CLAVE = 'tatu.tema'
/** Color de la barra del navegador en el celular, igual que el fondo de cada tema. */
const FONDO: Record<NombreTema, string> = { claro: '#F5F0E6', oscuro: '#0B1324' }

function esTema(valor: unknown): valor is NombreTema {
  return valor === 'claro' || valor === 'oscuro'
}

function leerGuardado(): NombreTema | null {
  try {
    const valor = localStorage.getItem(CLAVE)
    return esTema(valor) ? valor : null
  } catch {
    return null
  }
}

function guardar(tema: NombreTema) {
  try {
    localStorage.setItem(CLAVE, tema)
  } catch {
    // Sin almacenamiento: el tema dura lo que dure la pestaña.
  }
}

function aplicar(tema: NombreTema) {
  document.documentElement.dataset.tema = tema
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', FONDO[tema])
}

export function useTema() {
  const [tema, setTema] = useState<NombreTema>(() => (document.documentElement.dataset.tema === 'oscuro' ? 'oscuro' : 'claro'))

  useEffect(() => {
    aplicar(tema)
  }, [tema])

  useEffect(() => {
    const sistema = window.matchMedia('(prefers-color-scheme: dark)')
    const alCambiar = () => {
      if (!leerGuardado()) setTema(sistema.matches ? 'oscuro' : 'claro')
    }
    sistema.addEventListener('change', alCambiar)
    return () => sistema.removeEventListener('change', alCambiar)
  }, [])

  const alternar = useCallback(() => {
    const nuevo: NombreTema = tema === 'oscuro' ? 'claro' : 'oscuro'
    guardar(nuevo)
    setTema(nuevo)
  }, [tema])

  return { oscuro: tema === 'oscuro', alternar }
}
