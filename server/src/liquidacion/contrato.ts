// Contrato HTTP de la liquidación de la entidad (P-10): lo cumple el simulador y lo valida el
// cliente al recibirlo. Montos en unidades mínimas, como texto. Las descripciones alimentan OpenAPI.
import { z } from 'zod'

export const cedula = z.string().regex(/^\d{5,12}$/, 'cédula inválida').meta({ description: 'Número de cédula (5 a 12 dígitos).', examples: ['1000000001'] })
const unidades = z.string().regex(/^\d+$/, 'monto en unidades mínimas')

export const Resumen = z.strictObject({
  cedulas: z.number().int().nonnegative().meta({ description: 'Cuántas cédulas tiene la liquidación.', examples: [3] }),
  total: unidades.meta({ description: 'Suma de los pagos, en unidades mínimas de la moneda del programa. Será el tope al autorizar (RN-08).', examples: ['69000000'] }),
})
export type Resumen = z.infer<typeof Resumen>

/** CA-02.02 y CA-02.03: `disponible` con su monto, o ya pagado con `monto=null`. */
export const Pago = z.union([
  z.strictObject({
    cedula,
    disponible: z.literal(true).meta({ description: 'La cédula tiene un pago por cobrar.' }),
    monto: unidades.meta({ description: 'Monto a pagar en unidades mínimas.', examples: ['23000000'] }),
  }),
  z.strictObject({
    cedula,
    disponible: z.literal(false).meta({ description: 'El pago de esta cédula ya fue cobrado.' }),
    monto: z.null(),
  }),
])
export type Pago = z.infer<typeof Pago>

/** CA-02.04 */
export const MENSAJE_CEDULA_NO_ENCONTRADA = 'Esta cédula no está en la liquidación'

/** Lo que la plataforma entiende de una consulta por cédula. */
export type ConsultaPago = { tipo: 'disponible'; monto: number } | { tipo: 'pagado' } | { tipo: 'noExiste' }

/** Puerto hacia la liquidación: la plataforma consulta, nunca copia la lista (CA-02.05). */
export interface PuertoLiquidacion {
  resumen(programaId: string): Promise<{ cedulas: number; total: number }>
  pago(programaId: string, cedula: string): Promise<ConsultaPago>
}
