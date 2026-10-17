// Pantallas del punto bajo /punto. Sin el punto elegido en la entrada se vuelve a elegirlo.
//   /punto             inicio: caja de hoy, nuevo cobro y cobros de hoy (o la venta con bono)
//   /punto/nuevo       cédula → pagos de esa cédula (en el celular)
//   /punto/caja        mi caja
//   /punto/cobros/:id  PIN → pagando → pagado o rechazado
import { Navigate, Route, Routes, useParams } from 'react-router'
import { listarPuntos } from '@/api/punto'
import { usePolling } from '@/api/usePolling'
import { useRol } from '@/contexto/Rol'
import { CobroEnPunto } from './CobroEnPunto'
import { ContextoConsultaCedula, ContextoPunto, useEstadoConsultaCedula } from './datos'
import { InicioPunto } from './InicioPunto'
import { MiCaja } from './MiCaja'
import { NuevoCobro } from './NuevoCobro'

export function RutasPunto() {
  const { rol, puntoId } = useRol()
  if (rol !== 'punto' || !puntoId) return <Navigate to="/entrar/punto" replace />
  return <ConPunto id={puntoId} />
}

/** El punto que atiende, para todas sus pantallas: la lista de puntos se pide una vez al entrar. */
function ConPunto({ id }: { id: string }) {
  const puntos = usePolling(listarPuntos, null, true, { clave: id })
  // La cédula del nuevo cobro vive aquí: la comparten la vista del celular y la del computador
  const consulta = useEstadoConsultaCedula(id)
  const datos = puntos.datos?.find((p) => p.id === id) ?? null
  // El punto ya no existe (por ejemplo, la base se rehízo): se vuelve a elegir
  if (puntos.datos && !datos) return <Navigate to="/entrar/punto" replace />

  const valor = {
    id,
    datos,
    nombre: datos?.nombre ?? 'Punto de retiro',
    cargando: puntos.cargando,
    error: puntos.error,
    recargar: () => void puntos.recargar(),
  }
  return (
    <ContextoPunto value={valor}>
      <ContextoConsultaCedula value={consulta}>
        <Routes>
          <Route index element={<InicioPunto />} />
          <Route path="nuevo" element={<NuevoCobro />} />
          <Route path="caja" element={<MiCaja />} />
          <Route path="cobros/:id" element={<CobroPorId />} />
          <Route path="*" element={<Navigate to="/punto" replace />} />
        </Routes>
      </ContextoConsultaCedula>
    </ContextoPunto>
  )
}

/** Cada cobro es una pantalla nueva: el PIN digitado o un error no pasan de un cobro a otro. */
function CobroPorId() {
  const { id = '' } = useParams()
  return <CobroEnPunto key={id} />
}
