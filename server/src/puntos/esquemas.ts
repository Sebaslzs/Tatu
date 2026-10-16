// Validación en la frontera de lo que llega a /puntos. Las descripciones alimentan OpenAPI.
import { z } from 'zod'
import { billeteraTexto } from '../comun/billeteras.ts'
import { DIRECCION_POR_DEFECTO, TIPOS_PUNTO } from './reglas.ts'

export const EntradaPunto = z.object({
  nombre: z.string().trim().min(3).max(80).meta({ description: 'Nombre del punto o de la sede.', examples: ['Droguería El Centro'] }),
  // CA-03.01: opcional; vacía queda «Sin dirección»
  direccion: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => v || DIRECCION_POR_DEFECTO)
    .meta({ description: `Dirección. Opcional; si falta o está vacía queda «${DIRECCION_POR_DEFECTO}».`, examples: ['Calle 10 # 5-20'] }),
  billetera: billeteraTexto.meta({
    description:
      'Billetera Open Payments del punto, donde llega el reembolso. Acepta `$dominio/ruta` o `https://dominio/ruta`; se guarda como `https://` sin barra final y no puede repetirse.',
    examples: ['$ilp.interledger-test.dev/tatu-punto1'],
  }),
  tipo: z.enum(TIPOS_PUNTO).default('retiro').meta({
    description: '`retiro` entrega efectivo de un subsidio; `compra` es una sede de comercio que acepta bonos. Cada tipo atiende solo su canal.',
  }),
  programaId: z.uuid().optional().meta({
    description: 'Programa al que se asocia el punto. Si se indica, la moneda de la billetera debe ser la del programa.',
  }),
})

export type EntradaPunto = z.output<typeof EntradaPunto>
