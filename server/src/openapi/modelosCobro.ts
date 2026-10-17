// Modelos de respuesta del cobro, el beneficiario, las billeteras y el estado (Endpoints.md).
// Son estrictos: los tests de contrato comparan con ellos las respuestas reales.
import { z } from 'zod'
import { ESTADOS_COBRO } from '../cobros/estados.ts'
import { Cuenta, Moneda, Monto } from './modelos.ts'

const uuid = (descripcion: string) => z.uuid().meta({ description: descripcion })
const etiqueta = z.string().meta({ description: 'Cómo se muestra la persona sin revelar su cédula.', examples: ['C.C. de prueba 3'] })

export const Evento = z.strictObject({
  desde: z.string().nullable(),
  hacia: z.string().nullable(),
  texto: z.string().nullable(),
  creado: z.string(),
})

export const Cobro = z.strictObject({
  id: uuid('Identificador del cobro.'),
  referencia: z.string().meta({ description: 'Referencia corta para mostrar y conciliar.' }),
  programa: z.strictObject({ id: uuid('Programa cobrado.'), nombre: z.string() }),
  canal: z.enum(['cuenta', 'retiro', 'compra']),
  punto: z.strictObject({ id: uuid('Punto o sede.'), nombre: z.string(), billeteraCorta: z.string() }).nullable(),
  cuenta: z.strictObject({ billetera: z.string(), billeteraCorta: z.string() }).nullable(),
  persona: z.strictObject({ nombre: z.string(), etiqueta, novedad: z.boolean().meta({ description: 'Es un retroactivo cargado después de aprobar el permiso.' }) }),
  monto: Monto.nullable().meta({ description: 'Lo que paga el cobro; lo calcula el backend, nunca viene del cliente (RN-11).' }),
  totalCompra: Monto.nullable().meta({ description: 'Solo en compras con bono.' }),
  moneda: Moneda,
  estado: z.enum(ESTADOS_COBRO),
  motivo: z.strictObject({ codigo: z.string(), mensaje: z.string() }).nullable().meta({ description: 'Por qué se rechazó o falló, con el texto para la pantalla.' }),
  intentosRestantes: z.number().int().nullable().meta({ description: 'PIN que le quedan; solo mientras el cobro espera el PIN.' }),
  confirmarAntesDe: z.string().nullable().meta({ description: 'Hasta cuándo se puede confirmar; solo mientras espera el PIN.' }),
  segundosHastaPagado: z.number().nullable(),
  creado: z.string(),
  actualizado: z.string(),
  eventos: z.array(Evento).optional().meta({ description: 'La línea de tiempo; solo en `GET /cobros/{id}` y al crear o confirmar.' }),
})

export const PagoPendiente = z.strictObject({
  programa: z.strictObject({
    id: uuid('Programa que paga.'),
    nombre: z.string(),
    estado: z.enum(['Borrador', 'EsperandoAprobacion', 'Activo', 'Pausado', 'Cerrado']),
    tipo: z.enum(['subsidio', 'bono']),
  }),
  monto: Monto,
  moneda: Moneda,
  vigenciaFin: z.iso.date().meta({ description: 'Último día para cobrar (YYYY-MM-DD, hora de Bogotá).' }),
})

export const ResumenBeneficiario = z.strictObject({
  persona: z.strictObject({ nombre: z.string(), documento: z.string(), tienePin: z.boolean() }),
  pagos: z.array(PagoPendiente).meta({ description: 'Todos sus subsidios y bonos por cobrar.' }),
  pago: PagoPendiente.nullable().meta({ description: 'El primero de `pagos` (compatibilidad).' }),
  liquidacionDisponible: z.boolean().meta({ description: '`false` si la liquidación no respondió: «sin pagos» no sería la verdad.' }),
  cuenta: Cuenta.nullable(),
  ultimoCobro: Cobro.nullable(),
  historial: z.array(Cobro),
})

export const PersonaDemo = z.strictObject({ nombre: z.string(), etiqueta, documento: z.string() })

export const PagosPunto = z.strictObject({
  persona: z.strictObject({ nombre: z.string(), etiqueta, tienePin: z.boolean() }),
  pagos: z.array(PagoPendiente),
})

export const Billetera = z.strictObject({
  id: z.string().meta({ description: 'Billetera normalizada.', examples: ['https://ilp.interledger-test.dev/mi-wallet'] }),
  nombre: z.string().nullable(),
  moneda: Moneda,
})

export const Estado = z.strictObject({
  pagosReales: z.boolean().meta({ description: '`true` si están las credenciales de Open Payments y los pagos mueven dinero de prueba de verdad.' }),
  faltan: z.array(z.string()).meta({ description: 'Qué variables impiden pagar de verdad.' }),
  openPayments: z.strictObject({ billeteraCliente: z.string().nullable(), llave: z.string().nullable() }),
  programasConTokenFalso: z.number().int(),
  verificacionCuenta: z.enum(['subject', 'simulada']),
  baseDeDatos: z.strictObject({
    tipo: z.enum(['postgres', 'pglite']),
    donde: z.string().meta({ description: 'Servidor y base, nunca la contraseña.' }),
  }),
  puenteBreB: z.strictObject({ simulado: z.boolean(), responde: z.boolean() }),
})

export const MODELOS_COBRO = { Cobro, PagoPendiente, ResumenBeneficiario, PersonaDemo, PagosPunto, Billetera, Estado } as const
