// Rutas de la web. Se entra eligiendo un rol, sin cuentas de usuario.
import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { Cargando } from '@/componentes/Comun'
import { useRol } from '@/contexto/Rol'
import { ElegirRol } from '@/vistas/inicio/ElegirRol'
import { EntrarBeneficiario } from '@/vistas/inicio/EntrarBeneficiario'
import { EntrarEntidad } from '@/vistas/inicio/EntrarEntidad'
import { EntrarPunto } from '@/vistas/inicio/EntrarPunto'
import { RutasBeneficiario } from '@/vistas/beneficiario/RutasBeneficiario'
import { RutasEntidad } from '@/vistas/entidad/RutasEntidad'
import { RutasPunto } from '@/vistas/punto/RutasPunto'

// Demo del tatú animado (no está enlazada desde ninguna vista)
const DemoTatu = lazy(() => import('@/vistas/DemoTatu'))

/** La entidad tiene sus propias pantallas de escritorio (vistas/entidad/RutasEntidad.tsx). */
function AreaEntidad() {
  const { rol } = useRol()
  return rol === 'entidad' ? <RutasEntidad /> : <Navigate to="/entrar/entidad" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ElegirRol />} />
      <Route path="/entrar/entidad" element={<EntrarEntidad />} />
      <Route path="/entrar/beneficiario" element={<EntrarBeneficiario />} />
      <Route path="/entrar/punto" element={<EntrarPunto />} />
      <Route path="/entidad/*" element={<AreaEntidad />} />
      <Route path="/beneficiario/*" element={<RutasBeneficiario />} />
      <Route path="/punto/*" element={<RutasPunto />} />
      <Route
        path="/demo/tatu"
        element={
          <Suspense fallback={<Cargando />}>
            <DemoTatu />
          </Suspense>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
