// Modelos de respuesta de la API, como esquemas Zod estrictos. Sirven para dos cosas:
//   1. Se convierten a JSON Schema para el documento OpenAPI.
//   2. Los tests de contrato validan con ellos las respuestas reales: si la API devuelve un
//      campo que no está aquí (p. ej. un token), el test falla.
import { z } from 'zod'
import { TIPOS_PROGRAMA } from '../programas/estados.ts'
import { TIPOS_PUNTO } from '../puntos/reglas.ts'
import { Pago, Resumen } from '../liquidacion/contrato.ts'

const uuid = (descripcion: string) => z.uuid().meta({ description: descripcion })

export const Moneda = z.strictObject({
  assetCode: z.string().regex(/^[A-Z]{3}$/).meta({ description: 'Código ISO 4217 de la moneda.', examples: ['COP'] }),
  assetScale: z.number().int().min(0).meta({ description: 'Decimales de la moneda: $1 = 10^assetScale unidades mínimas.', examples: [2] }),
})

export const Monto = z.strictObject({
  valor: z.string().regex(/^\d+$/).meta({ description: 'Entero en unidades mínimas, como texto. $230.000,00 COP = `"23000000"`.', examples: ['23000000'] }),
  ...Moneda.shape,
})

export const ErrorApi = z.strictObject({
  error: z.strictObject({
    codigo: z.string().meta({ description: 'Código estable del error; es lo que debe usar el cliente para decidir.', examples: ['BilleteraNoEncontrada'] }),
    mensaje: z.string().meta({ description: 'Texto para la persona, en español.', examples: ['No encontramos esa cuenta'] }),
  }),
})

export const Entidad = z.strictObject({
  id: uuid('Identificador de la entidad.'),
  nombre: z.string().meta({ examples: ['Alcaldía de Prueba'] }),
  tipo: z.enum(['gobierno', 'caja_compensacion', 'empresa', 'fundacion', 'otro']),
})

export const Programa = z.strictObject({
  id: uuid('Identificador del programa.'),
  entidadId: uuid('Entidad financiadora.'),
  nombre: z.string(),
  tipo: z.enum(TIPOS_PROGRAMA),
  destino: z.enum(['libre', 'restringido']).meta({ description: '`libre` para un subsidio; `restringido` para un bono.' }),
  canales: z.array(z.enum(['cuenta', 'retiro', 'compra'])).meta({ description: 'Canales de cobro: subsidio → cuenta y retiro; bono → compra.' }),
  categorias: z.array(z.string()).meta({ description: 'Categorías de comercio del bono; vacío en un subsidio.' }),
  billetera: z.url().meta({ description: 'Billetera normalizada (`https://`, sin barra final).', examples: ['https://ilp.interledger-test.dev/tatu-programa'] }),
  moneda: Moneda.meta({ description: 'Moneda copiada de la billetera resuelta; nunca viene del formulario.' }),
  vigenciaInicio: z.iso.datetime().meta({ description: 'Instante UTC de inicio (00:00 del día en Bogotá).' }),
  vigenciaFin: z.iso.datetime().meta({ description: 'Instante UTC de fin (23:59:59.999 del día en Bogotá).' }),
  estado: z.enum(['Borrador', 'EsperandoAprobacion', 'Activo', 'Pausado', 'Cerrado']),
  montoPorPersona: Monto.nullable().meta({ description: 'Monto por persona; `null` si no se definió.' }),
  tope: Monto.nullable().meta({ description: 'Tope del permiso (RN-08); `null` hasta que se aprueba.' }),
  permisoActivo: z.boolean().meta({ description: 'Hay un permiso usable en el banco.' }),
  permisoVencido: z.boolean().meta({ description: 'El programa cobraba y el banco ya no acepta su permiso.' }),
})

export const ResumenLiquidacion = z.strictObject({
  cedulas: Resumen.shape.cedulas,
  total: Monto.meta({ description: 'Total de la liquidación en la moneda del programa; será el tope al autorizar.' }),
})

export const Punto = z.strictObject({
  id: uuid('Identificador del punto.'),
  nombre: z.string(),
  direccion: z.string().meta({ examples: ['Sin dirección'] }),
  billetera: z.url(),
  tipo: z.enum(TIPOS_PUNTO),
})

export const PuntoRegistrado = z.strictObject({
  ...Punto.shape,
  moneda: Moneda.meta({ description: 'Moneda real de la billetera del punto.' }),
})

export const Salud = z.strictObject({ estado: z.literal('ok') })

export const ConfigPublica = z.strictObject({
  pollIntervaloMs: z.number().int().meta({ description: 'Cada cuántos ms consulta el cliente el estado de un cobro.', examples: [1000] }),
  extras: z.strictObject({
    bono: z.boolean(),
    qr: z.boolean(),
    pdf417: z.boolean(),
    contrato: z.boolean(),
    deploy: z.boolean(),
  }).meta({ description: 'Banderas `EXTRA_*`: un extra apagado no rompe el flujo principal (RNF-10).' }),
})

export { Pago, Resumen }

/** Modelos que van a `components.schemas`, por nombre. */
export const MODELOS = {
  Moneda,
  Monto,
  Error: ErrorApi,
  Entidad,
  Programa,
  ResumenLiquidacion,
  Punto,
  PuntoRegistrado,
  Salud,
  ConfigPublica,
  ResumenPagos: Resumen,
  PagoCedula: Pago,
} as const
