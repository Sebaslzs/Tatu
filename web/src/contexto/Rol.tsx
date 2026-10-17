// Rol elegido en el selector (HU-19) y, para el beneficiario, su cédula. Se recuerdan en
// sessionStorage al recargar (CA-19.02). La cédula sola no permite cobrar: cada cobro exige la
// cuenta verificada o el PIN.
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

export type Rol = 'entidad' | 'beneficiario' | 'punto'

const CLAVE = 'tatu.rol'
const CLAVE_CEDULA = 'tatu.cedula'
const ROLES: readonly Rol[] = ['entidad', 'beneficiario', 'punto']

function leer(clave: string): string | null {
  try {
    return sessionStorage.getItem(clave)
  } catch {
    return null
  }
}

function guardar(clave: string, valor: string | null) {
  try {
    if (valor) sessionStorage.setItem(clave, valor)
    else sessionStorage.removeItem(clave)
  } catch {
    // Sin almacenamiento el rol vive solo en memoria hasta recargar
  }
}

function leerRol(): Rol | null {
  const guardado = leer(CLAVE)
  return ROLES.includes(guardado as Rol) ? (guardado as Rol) : null
}

interface ValorRol {
  rol: Rol | null
  /** Cédula con la que entró el beneficiario; null en los otros roles. */
  cedula: string | null
  elegirRol: (rol: Rol | null) => void
  entrarComoBeneficiario: (cedula: string) => void
}

const ContextoRol = createContext<ValorRol | null>(null)

export function ProveedorRol({ children }: { children: ReactNode }) {
  const [rol, setRol] = useState<Rol | null>(leerRol)
  const [cedula, setCedula] = useState<string | null>(() => (leerRol() === 'beneficiario' ? leer(CLAVE_CEDULA) : null))

  const elegirRol = useCallback((nuevo: Rol | null) => {
    guardar(CLAVE, nuevo)
    if (nuevo !== 'beneficiario') {
      guardar(CLAVE_CEDULA, null)
      setCedula(null)
    }
    setRol(nuevo)
  }, [])

  const entrarComoBeneficiario = useCallback((nueva: string) => {
    guardar(CLAVE, 'beneficiario')
    guardar(CLAVE_CEDULA, nueva)
    setCedula(nueva)
    setRol('beneficiario')
  }, [])

  return <ContextoRol value={{ rol, cedula, elegirRol, entrarComoBeneficiario }}>{children}</ContextoRol>
}

export function useRol(): ValorRol {
  const valor = useContext(ContextoRol)
  if (!valor) throw new Error('useRol debe usarse dentro de <ProveedorRol>')
  return valor
}
