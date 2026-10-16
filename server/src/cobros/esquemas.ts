// Validación en la frontera de lo que llega a /cobros. Las descripciones alimentan OpenAPI.
import { z } from 'zod'
import { cedula, pin } from '../liquidacion/contrato.ts'

export const EntradaCobro = z.strictObject({
  programaId: z.uuid().optional().meta({ description: 'Programa a cobrar. Opcional: el punto no elige; se toma el programa activo con un pago disponible para la cédula (CA-10.04).' }),
  cedula,
  canal: z.enum(['cuenta', 'retiro', 'compra']).meta({
    description: '`cuenta` paga a la cuenta de la persona sin PIN; `retiro` en un punto de retiro, con PIN; `compra` es un bono en un comercio autorizado (extra HU-21).',
  }),
  puntoId: z.uuid().optional().meta({ description: 'Punto o sede. Obligatorio en `retiro` y `compra`; prohibido en `cuenta`.' }),
  llaveIdempotencia: z.string().min(8).max(100).meta({
    description: 'La web genera un UUID por intento. Repetir la misma llave devuelve el mismo cobro: un doble clic no duplica el pago (CA-10.07).',
    examples: ['2f4e9a3c-6f7e-4c43-9d70-7d9ee1b0c0a1'],
  }),
  // RN-11: el monto nunca viene del navegador; solo el total de una compra (bono)
  totalCompra: z.string().regex(/^\d+$/).optional().meta({
    description: 'Solo en `compra`: el total de la compra en unidades mínimas. El monto del cobro **nunca** viene del cliente: lo calcula el backend (RN-05, RN-11).',
  }),
})
export type EntradaCobro = z.output<typeof EntradaCobro>

export const Confirmacion = z.strictObject({ pin })
