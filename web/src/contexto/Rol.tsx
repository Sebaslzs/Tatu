// Rol elegido en el selector (HU-19); para el beneficiario, su cédula, y para el punto, desde cuál
// atiende. Se recuerdan en sessionStorage al recargar (CA-19.02). La cédula sola no permite cobrar:
// cada cobro exige la cuenta verificada o el PIN.
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

export type Rol = 'entidad' | 'beneficiario' | 'punto'

const CLAVE = 'tatu.rol'
const CLAVE_CEDULA = 'tatu.cedula'
// Del punto solo se guarda su id: las pantallas piden su nombre y su tipo a la API
const CLAVE_PUNTO = 'tatu.punto'
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
  /** Punto desde el que se atiende; null en los otros roles. */
  puntoId: string | null
  elegirRol: (rol: Rol | null) => void
  entrarComoBeneficiario: (cedula: string) => void
  entrarComoPunto: (puntoId: string) => void
}

const ContextoRol = createContext<ValorRol | null>(null)

export function ProveedorRol({ children }: { children: ReactNode }) {
  const [rol, setRol] = useState<Rol | null>(leerRol)
  const [cedula, setCedula] = useState<string | null>(() => (leerRol() === 'beneficiario' ? leer(CLAVE_CEDULA) : null))
  const [puntoId, setPuntoId] = useState<string | null>(() => (leerRol() === 'punto' ? leer(CLAVE_PUNTO) : null))

  const elegirRol = useCallback((nuevo: Rol | null) => {
    guardar(CLAVE, nuevo)
    if (nuevo !== 'beneficiario') {
      guardar(CLAVE_CEDULA, null)
      setCedula(null)
    }
    if (nuevo !== 'punto') {
      guardar(CLAVE_PUNTO, null)
      setPuntoId(null)
    }
    setRol(nuevo)
  }, [])

  const entrarComoBeneficiario = useCallback((nueva: string) => {
    guardar(CLAVE, 'beneficiario')
    guardar(CLAVE_CEDULA, nueva)
    setCedula(nueva)
    setRol('beneficiario')
  }, [])

  const entrarComoPunto = useCallback((id: string) => {
    guardar(CLAVE, 'punto')
    guardar(CLAVE_PUNTO, id)
    setPuntoId(id)
    setRol('punto')
  }, [])

  return <ContextoRol value={{ rol, cedula, puntoId, elegirRol, entrarComoBeneficiario, entrarComoPunto }}>{children}</ContextoRol>
}

export function useRol(): ValorRol {
  const valor = useContext(ContextoRol)
  if (!valor) throw new Error('useRol debe usarse dentro de <ProveedorRol>')
  return valor
}
