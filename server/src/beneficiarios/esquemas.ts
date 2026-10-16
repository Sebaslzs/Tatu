// Validación en la frontera de lo que llega a /beneficiarios. Las descripciones alimentan OpenAPI.
import { z } from 'zod'
import { billeteraTexto } from '../comun/billeteras.ts'
import { cedula, pin } from '../liquidacion/contrato.ts'

/** Registro del equipo: la cédula y la billetera; el nombre y el PIN son opcionales. */
export const EntradaPersona = z.strictObject({
  cedula,
  billetera: billeteraTexto.meta({ description: 'Billetera Open Payments de la persona; `$dominio/ruta` o `https://…`.' }),
  nombre: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((v) => v || undefined)
    .meta({ description: 'Nombre que se inscribe en la liquidación. Si falta, se usa el nombre público de la billetera.', examples: ['Luis Gómez'] }),
  pin: pin.optional().meta({ description: 'PIN de 4 dígitos que se inscribe en la liquidación. Opcional: sin él la persona solo cobra a su cuenta.' }),
  cobraCon: z
    .enum(['wallet', 'llaveCedula'])
    .default('wallet')
    .meta({
      description:
        '`wallet` enlaza la billetera como cuenta. `llaveCedula` registra la cédula como llave Bre-B en el banco puente simulado y **no** enlaza cuenta: al cobrar, RN-17 la encuentra sola.',
    }),
})
export type EntradaPersona = z.output<typeof EntradaPersona>

export const EntradaPin = z.strictObject({ pin })
