// Rutas de la web (Especificación § 9.5). Se entra eligiendo un rol, sin cuentas (HU-19, AD-15).
import { Navigate, Route, Routes, useNavigate } from 'react-router'
import { useRol, type Rol } from '@/contexto/Rol'
import { ElegirRol } from '@/vistas/inicio/ElegirRol'
import { EntrarBeneficiario } from '@/vistas/inicio/EntrarBeneficiario'
import { EntrarEntidad } from '@/vistas/inicio/EntrarEntidad'
import { EntrarPunto } from '@/vistas/inicio/EntrarPunto'
import { CabeceraCelular } from '@/vistas/inicio/piezas'
import { VistaBeneficiario } from '@/vistas/beneficiario/VistaBeneficiario'
import { RutasEntidad } from '@/vistas/entidad/RutasEntidad'
import { VistaEntidad } from '@/vistas/entidad/VistaEntidad'
import { VistaPunto } from '@/vistas/punto/VistaPunto'

const VISTAS: Record<Rol, () => React.JSX.Element> = {
  entidad: VistaEntidad,
  beneficiario: VistaBeneficiario,
  punto: VistaPunto,
}

/** Lo que hay después de Entrar. Por ahora solo el marcador de cada rol. */
function AreaRol({ rol }: { rol: Rol }) {
  const { rol: elegido } = useRol()
  const navegar = useNavigate()
  if (elegido !== rol) return <Navigate to={`/entrar/${rol}`} replace />
  // La entidad tiene sus propias pantallas de escritorio (vistas/entidad/RutasEntidad.tsx)
  if (rol === 'entidad') return <RutasEntidad />
  const Vista = VISTAS[rol]

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col gap-6 px-5 pt-[18px] pb-6">
      <CabeceraCelular />
      {/* El rol se borra al llegar a "/" (ElegirRol), no aquí: si se borrara antes, esta guardia redirigiría a /entrar */}
      <button
        type="button"
        onClick={() => navegar('/')}
        className="-ml-2 inline-flex min-h-11 cursor-pointer items-center self-start border-0 bg-transparent px-2 font-sans text-base font-semibold text-noche"
      >
        ← Cambiar de rol
      </button>
      <Vista />
    </main>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ElegirRol />} />
      <Route path="/entrar/entidad" element={<EntrarEntidad />} />
      <Route path="/entrar/beneficiario" element={<EntrarBeneficiario />} />
      <Route path="/entrar/punto" element={<EntrarPunto />} />
      <Route path="/entidad/*" element={<AreaRol rol="entidad" />} />
      <Route path="/beneficiario/*" element={<AreaRol rol="beneficiario" />} />
      <Route path="/punto/*" element={<AreaRol rol="punto" />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
