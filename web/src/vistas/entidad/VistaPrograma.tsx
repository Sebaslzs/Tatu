// /entidad/programas/:id muestra el tablero, o el resumen del cierre cuando está Cerrado.
import { Navigate, useParams } from 'react-router'
import { Cargando, ErrorCarga } from '@/componentes/Comun'
import { MarcoEntidad } from '@/componentes/MarcoEntidad'
import { rutaDelPrograma, tienePermiso } from '@/lib/pantallas'
import ProgramaCerrado from './ProgramaCerrado'
import Tablero from './Tablero'
import { useTablero } from './useTablero'

export default function VistaPrograma() {
  const { id = '' } = useParams()
  const consulta = useTablero(id)
  const d = consulta.datos

  if (!d) {
    return <MarcoEntidad>{consulta.error ? <ErrorCarga mensaje={consulta.error} reintentar={() => void consulta.recargar()} /> : <Cargando />}</MarcoEntidad>
  }
  const estado = d.programa.estado
  if (!tienePermiso(estado)) return <Navigate to={rutaDelPrograma(id, estado)} replace />
  if (estado === 'Cerrado') return <ProgramaCerrado datos={d} />
  return <Tablero datos={d} error={consulta.error} recargar={consulta.recargar} />
}
