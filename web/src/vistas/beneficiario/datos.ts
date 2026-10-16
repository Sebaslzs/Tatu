// Datos del beneficiario que comparten sus pantallas.
import { obtenerResumen, type PagoPendiente, type Resumen } from '@/api/beneficiario'
import { useRol } from '@/contexto/Rol'
import { useConsulta } from '@/lib/useConsulta'

/** Resumen de la persona que entró: subsidios por cobrar, cuenta, puntos e historial. */
export function useResumen() {
  const { cedula } = useRol()
  return useConsulta<Resumen>(cedula, () => obtenerResumen(cedula ?? ''))
}

/** Busca un pago pendiente por programa. */
export const pagoDe = (r: Resumen | null, programaId: string): PagoPendiente | undefined =>
  r?.pagos.find((p) => p.programa.id === programaId)

export const nombreTipo = (p: PagoPendiente) => (p.programa.tipo === 'bono' ? 'Bono' : 'Subsidio')
