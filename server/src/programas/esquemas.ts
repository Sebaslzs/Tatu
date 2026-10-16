// Validación en la frontera (Zod) de lo que llega a /programas. Las descripciones y ejemplos
// alimentan la documentación OpenAPI (openapi/), así la doc y la validación no se desfasan.
import { z } from 'zod'
import { billeteraTexto } from '../comun/billeteras.ts'
import { fechaTexto, finDelDia, inicioDelDia } from '../comun/fechas.ts'
import { TIPOS_PROGRAMA } from './estados.ts'
import { MAX_CATEGORIAS, vigenciaValida } from './reglas.ts'

/** En pesos, como lo escribe la entidad: «230000» o «230000.50». */
const montoEnPesos = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, 'monto en pesos, sin puntos de miles')
  .meta({
    description: 'Monto por persona en la moneda de la billetera, con punto decimal y sin separador de miles. Se guarda en unidades mínimas con la escala de la billetera.',
    examples: ['230000', '60.50'],
  })

const categorias = z
  .array(z.string().trim().toLowerCase().min(2).max(60))
  .max(MAX_CATEGORIAS, `máximo ${MAX_CATEGORIAS} categorías`)
  .refine((lista) => new Set(lista).size === lista.length, 'categorías repetidas')
  .meta({
    description: `Categorías de comercio que acepta un bono (máximo ${MAX_CATEGORIAS}, sin repetir). Solo aplica a \`tipo=bono\`.`,
    examples: [['alimentos', 'salud']],
  })

const campos = {
  entidadId: z.uuid().meta({ description: 'Entidad financiadora (ver GET /entidades).', examples: ['11111111-1111-4111-8111-111111111111'] }),
  nombre: z.string().trim().min(3).max(80).meta({ description: 'Nombre del programa.', examples: ['Subsidio de transporte'] }),
  billetera: billeteraTexto.meta({
    description:
      'Billetera Open Payments de la que se paga. Acepta `$dominio/ruta` o `https://dominio/ruta`; se guarda como `https://` sin `$` ni barra final. Se resuelve contra su servidor y de ahí se copia la moneda.',
    examples: ['$ilp.interledger-test.dev/tatu-programa'],
  }),
  vigenciaInicio: fechaTexto.meta({
    description: 'Inicio de la vigencia: `AAAA-MM-DD` (desde las 00:00 en Bogotá) o un instante ISO 8601.',
    examples: ['2026-10-01'],
  }),
  vigenciaFin: fechaTexto.meta({
    description: 'Fin de la vigencia: `AAAA-MM-DD` (hasta las 23:59:59.999 en Bogotá, el día completo) o un instante ISO 8601. Debe ser posterior al inicio.',
    examples: ['2026-12-31'],
  }),
  tipo: z.enum(TIPOS_PROGRAMA).meta({
    description: '`subsidio` (destino libre, cobro a la cuenta o en un punto de retiro) o `bono` (destino restringido a comercios; requiere `EXTRA_BONO`).',
  }),
  montoPorPersona: montoEnPesos,
  categorias,
}

const MENSAJE_VIGENCIA = { message: 'la vigencia debe terminar después de empezar', path: ['vigenciaFin'] }

const vigenciaCoherente = (v: { vigenciaInicio?: string | undefined; vigenciaFin?: string | undefined }) =>
  !v.vigenciaInicio || !v.vigenciaFin || vigenciaValida(inicioDelDia(v.vigenciaInicio), finDelDia(v.vigenciaFin))

export const EntradaPrograma = z
  .object({
    ...campos,
    tipo: campos.tipo.default('subsidio'),
    montoPorPersona: campos.montoPorPersona.optional(),
    categorias: campos.categorias.optional(),
  })
  .refine(vigenciaCoherente, MENSAJE_VIGENCIA)

export const EdicionPrograma = z.object(campos).partial().refine(vigenciaCoherente, MENSAJE_VIGENCIA)

export type EntradaPrograma = z.output<typeof EntradaPrograma>
export type EdicionPrograma = z.output<typeof EdicionPrograma>
