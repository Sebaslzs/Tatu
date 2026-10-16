// Rutas de la entidad bajo /entidad (las del piloto, rama produccion). El banco vuelve a
// /entidad/programas/:id/aprobar?resultado=… (server/src/programas/autorizacion.ts).
import { Navigate, Route, Routes } from 'react-router'
import AprobarEnBanco from './AprobarEnBanco'
import BeneficiariosPrograma from './BeneficiariosPrograma'
import CerrarPrograma from './CerrarPrograma'
import ConectarPrograma from './ConectarPrograma'
import DetalleCobro from './DetalleCobro'
import ListaProgramas from './ListaProgramas'
import VistaPrograma from './VistaPrograma'

export function RutasEntidad() {
  return (
    <Routes>
      <Route index element={<ListaProgramas />} />
      <Route path="programas/nuevo" element={<ConectarPrograma />} />
      <Route path="programas/:id/editar" element={<ConectarPrograma />} />
      <Route path="programas/:id/aprobar" element={<AprobarEnBanco />} />
      <Route path="programas/:id/cerrar" element={<CerrarPrograma />} />
      <Route path="programas/:id/beneficiarios" element={<BeneficiariosPrograma />} />
      <Route path="programas/:id" element={<VistaPrograma />} />
      <Route path="cobros/:id" element={<DetalleCobro />} />
      <Route path="*" element={<Navigate to="/entidad" replace />} />
    </Routes>
  )
}
