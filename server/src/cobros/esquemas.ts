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
  // RN-11: el monto lo decide el backend; el punto solo puede pedir cuánto retirar, y se valida contra el saldo
  totalCompra: z.string().regex(/^\d+$/).optional().meta({
    description: 'Solo en `compra`: el total de la compra en unidades mínimas. El monto del bono lo calcula el backend (RN-05, RN-11).',
  }),
  monto: z.string().regex(/^\d+$/).optional().meta({
    description:
      'Solo en `retiro` (HU-26): cuánto quiere retirar la persona, en unidades mínimas. Sin este campo se retira **todo el saldo**. El backend lo valida contra el saldo (RN-19 a RN-21); el canal `cuenta` siempre paga todo el saldo (RN-22).',
    examples: ['9000000'],
  }),
  venta: z
    .strictObject({
      valor: z.string().regex(/^\d+$/).meta({ description: 'Valor de la compra en unidades mínimas. Debe ser menor que el retiro (RN-23).', examples: ['5000000'] }),
      descripcion: z.string().trim().min(2).max(120).optional().meta({ description: 'Opcional: qué compró, en palabras del punto (p. ej. «Mercado»).', examples: ['Mercado'] }),
    })
    .optional()
    .meta({
      description:
        'Solo en `retiro` (HU-27): la compra que la persona hizo en el punto durante el retiro. Es parte del retiro: el efectivo que se entrega es el retiro menos la compra. Se envía a facturación cuando el cobro queda `Pagado`.',
    }),
})
export type EntradaCobro = z.output<typeof EntradaCobro>

export const Confirmacion = z.strictObject({ pin })
