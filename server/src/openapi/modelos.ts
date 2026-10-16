// Modelos de respuesta de la API, como esquemas Zod estrictos. Sirven para dos cosas:
//   1. Se convierten a JSON Schema para el documento OpenAPI.
//   2. Los tests de contrato validan con ellos las respuestas reales: si la API devuelve un
//      campo que no está aquí (p. ej. un token), el test falla.
import { z } from 'zod'
import { TIPOS_PROGRAMA } from '../programas/estados.ts'
import { TIPOS_PUNTO } from '../puntos/reglas.ts'
import { Pago, Persona, RespuestaPin, Resumen } from '../liquidacion/contrato.ts'
import { Coincidencia, Llave, Resolucion, TipoLlave } from '../puente/contrato.ts'

const uuid = (descripcion: string) => z.uuid().meta({ description: descripcion })

export const Moneda = z.strictObject({
  codigo: z.string().regex(/^[A-Z]{3}$/).meta({ description: 'Código ISO 4217 de la moneda.', examples: ['COP'] }),
  escala: z.number().int().min(0).meta({ description: 'Decimales de la moneda: $1 = 10^escala unidades mínimas.', examples: [2] }),
})

export const Monto = z.string().regex(/^\d+$/).meta({
  description: 'Monto en unidades mínimas de la moneda, como texto: «23000000» con escala 2 es $230.000.',
  examples: ['23000000'],
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
  vigenciaInicio: z.iso.date().meta({ description: 'Primer día de vigencia (YYYY-MM-DD, hora de Bogotá).', examples: ['2026-10-16'] }),
  vigenciaFin: z.iso.date().meta({ description: 'Último día de vigencia (YYYY-MM-DD, hora de Bogotá).', examples: ['2026-12-31'] }),
  estado: z.enum(['Borrador', 'EsperandoAprobacion', 'Activo', 'Pausado', 'Cerrado']),
  montoPorPersona: Monto.nullable().meta({ description: 'Monto por persona; `null` si no se definió.' }),
  tope: Monto.nullable().meta({ description: 'Tope del permiso (RN-08); `null` hasta que se aprueba.' }),
  permisoActivo: z.boolean().meta({ description: 'Hay un permiso usable en el banco.' }),
  permisoVencido: z.boolean().meta({ description: 'El programa cobraba y el banco ya no acepta su permiso.' }),
})

export const ResumenLiquidacion = z.strictObject({
  cedulas: Resumen.shape.cedulas,
  total: Monto.meta({ description: 'Total de la liquidación en la moneda del programa; será el tope al autorizar.' }),
  moneda: Moneda,
})

export const Autorizacion = z.strictObject({
  redirect: z.url().meta({
    description: 'Enlace de consentimiento en el banco. Se devuelve y no se guarda: la persona va ahí a aprobar.',
    examples: ['https://auth.interledger-test.dev/interact/1'],
  }),
  programa: Programa.meta({ description: 'El programa, ya en `EsperandoAprobacion` y con su tope fijado.' }),
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

export const Cuenta = z.strictObject({
  id: uuid('Identificador de la cuenta.'),
  documento: z.string().meta({ examples: ['1000000002'] }),
  estado: z.enum(['SinEnlazar', 'PorVerificar', 'Verificada']),
  billetera: z.url().meta({ description: 'Billetera a la que llega el pago.' }),
  billeteraCorta: z.string().meta({ examples: ['…/prueba-luis'] }),
  tipoLlave: TipoLlave.nullable().meta({ description: 'Tipo de la llave Bre-B elegida; `null` si la cuenta es una billetera escrita a mano.' }),
  llave: z.string().nullable().meta({ description: 'La llave **enmascarada**, nunca completa.', examples: ['300***4567'] }),
  verificadaEn: z.string().nullable(),
})

export const ResultadoEnlace = z.strictObject({
  redirect: z.url().nullable().meta({ description: 'Enlace para aprobar en la billetera (verificación con `subject`); `null` si no hace falta aprobar nada.' }),
  cuenta: Cuenta,
})

export const LlaveConsultada = z.strictObject({
  tipoLlave: TipoLlave,
  llave: z.string().meta({ description: 'La llave enmascarada.', examples: ['300***4567'] }),
  titular: z.string().meta({ description: 'Titular enmascarado, para «¿Eres Luis G***?».', examples: ['Luis G***'] }),
})

export const Beneficiario = z.strictObject({
  documento: z.string(),
  nombre: z.string().meta({ description: 'Lo trae la liquidación; Tatú no lo guarda. Si no responde: «Persona 1234».' }),
  billetera: z.string().nullable(),
  billeteraCorta: z.string().nullable(),
  moneda: Moneda.nullable(),
  estadoCuenta: z.enum(['SinEnlazar', 'PorVerificar', 'Verificada']).nullable(),
  tienePin: z.boolean(),
  registrado: z.string(),
})

export const PinRegistrado = z.strictObject({ documento: z.string(), tienePin: z.literal(true) })

export { Coincidencia, Llave, Pago, Persona, RespuestaPin, Resolucion, Resumen }

/** Modelos que van a `components.schemas`, por nombre. */
export const MODELOS = {
  Moneda,
  Monto,
  Error: ErrorApi,
  Entidad,
  Programa,
  ResumenLiquidacion,
  Autorizacion,
  Punto,
  PuntoRegistrado,
  Salud,
  ConfigPublica,
  ResumenPagos: Resumen,
  PagoCedula: Pago,
  Cuenta,
  ResultadoEnlace,
  LlaveConsultada,
  Beneficiario,
  PinRegistrado,
  Persona,
  RespuestaPin,
  Llave,
  Resolucion,
  Coincidencia,
} as const
