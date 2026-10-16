// Contrato HTTP de la liquidación (P-10): tipos y validación con Zod que comparten
// el simulador y quien lo consulta.
import { z } from 'zod'

export const respuestaLiquidacion = z.object({
  programa: z.string(),
  cedula: z.string(),
  nombre: z.string(),
  monto: z.number().int().nonnegative(),
  pagado: z.boolean(),
})

export type RespuestaLiquidacion = z.infer<typeof respuestaLiquidacion>
