// Rol elegido en el selector (HU-19). Se recuerda en sessionStorage al recargar
// (CA-19.02) y nunca guarda datos sensibles.
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

export type Rol = 'entidad' | 'beneficiario' | 'punto'

const CLAVE = 'tatu.rol'
const ROLES: readonly Rol[] = ['entidad', 'beneficiario', 'punto']

function leerRol(): Rol | null {
  const guardado = sessionStorage.getItem(CLAVE)
  return ROLES.includes(guardado as Rol) ? (guardado as Rol) : null
}

interface ValorRol {
  rol: Rol | null
  elegirRol: (rol: Rol | null) => void
}

const ContextoRol = createContext<ValorRol | null>(null)

export function ProveedorRol({ children }: { children: ReactNode }) {
  const [rol, setRol] = useState<Rol | null>(leerRol)

  const elegirRol = useCallback((nuevo: Rol | null) => {
    if (nuevo) sessionStorage.setItem(CLAVE, nuevo)
    else sessionStorage.removeItem(CLAVE)
    setRol(nuevo)
  }, [])

  return <ContextoRol value={{ rol, elegirRol }}>{children}</ContextoRol>
}

export function useRol(): ValorRol {
  const valor = useContext(ContextoRol)
  if (!valor) throw new Error('useRol debe usarse dentro de <ProveedorRol>')
  return valor
}
