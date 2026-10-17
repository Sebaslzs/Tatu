// Pantallas del beneficiario. Sin cédula en la sesión se vuelve al acceso.
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { useRol } from '@/contexto/Rol'
import { Cobro } from './Cobro'
import { DondeCobrar } from './DondeCobrar'
import { EnlazarCuenta } from './EnlazarCuenta'
import { MisSubsidios } from './MisSubsidios'
import { Subsidio } from './Subsidio'

export function RutasBeneficiario() {
  const { rol, cedula } = useRol()
  if (rol !== 'beneficiario' || !cedula) return <Navigate to="/entrar/beneficiario" replace />

  return (
    <Routes>
      <Route index element={<MisSubsidios />} />
      <Route path="subsidios/:programaId" element={<Subsidio />} />
      <Route path="cuenta" element={<EnlazarCuenta />} />
      <Route path="puntos" element={<DondeCobrar />} />
      <Route path="cobrar/:programaId" element={<CobroPorVisita />} />
      <Route path="cobros/:id" element={<CobroPorVisita />} />
      <Route path="*" element={<Navigate to="/beneficiario" replace />} />
    </Routes>
  )
}

/**
 * Cada visita a un cobro es una pantalla nueva, salvo el paso de «pidiendo» al cobro ya creado: esa
 * navegación lleva la misma visita para que el tatú siga su animación sin reiniciarse.
 */
function CobroPorVisita() {
  const location = useLocation()
  const visita = (location.state as { visita?: string } | null)?.visita ?? location.key
  return <Cobro key={visita} visita={visita} />
}
