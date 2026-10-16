// Validación en la frontera de lo que llega a /cuentas. Las descripciones alimentan OpenAPI.
import { z } from 'zod'
import { billeteraTexto } from '../comun/billeteras.ts'
import { cedula, pin } from '../liquidacion/contrato.ts'
import { TipoLlave } from '../puente/contrato.ts'

const pinOpcional = pin.optional().meta({
  description: 'PIN de 4 dígitos. Obligatorio si la persona tiene PIN registrado, salvo con una llave tipo cédula propia (RN-15).',
})

/** Una llave Bre-B con el tipo que eligió la persona (RN-14). */
export const EntradaCuentaConLlave = z.strictObject({
  cedula,
  tipoLlave: TipoLlave,
  llave: z.string().trim().min(3).max(80).meta({ description: 'La llave tal como la escribe la persona; se limpia según el tipo.', examples: ['3001234567'] }),
  pin: pinOpcional,
})

/** Opción avanzada: una billetera Open Payments escrita a mano (CA-07.05). */
export const EntradaCuentaConBilletera = z.strictObject({
  cedula,
  billetera: billeteraTexto.meta({ description: 'Billetera Open Payments de la persona; `$dominio/ruta` o `https://…`.' }),
  pin: pinOpcional,
})

export const EntradaCuenta = z.union([EntradaCuentaConLlave, EntradaCuentaConBilletera])
export type EntradaCuenta = z.output<typeof EntradaCuenta>
