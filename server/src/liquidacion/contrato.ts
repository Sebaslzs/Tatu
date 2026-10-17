// Contrato HTTP de la liquidación de la entidad (P-10): lo cumple el simulador y lo valida el
// cliente al recibirlo. Montos en unidades mínimas, como texto. Las descripciones alimentan OpenAPI.
//
// La plataforma no guarda nombres ni PIN: los pide aquí. Del PIN solo pregunta «¿es este?»; nunca
// lo recibe de vuelta.
import { z } from 'zod'

export const documento = z
  .string()
  .regex(/^[A-Za-z0-9]{3,20}$/, 'documento inválido')
  .meta({ description: 'Documento de la persona, sin puntos ni espacios (3 a 20 letras o dígitos).', examples: ['1000000001'] })
/** La cédula con que se registra una persona (POST /beneficiarios): solo dígitos, de 5 a 12. */
export const cedula = z
  .string()
  .regex(/^\d{5,12}$/, 'la cédula va sin puntos ni espacios: de 5 a 12 dígitos')
  .meta({ description: 'Número de cédula (5 a 12 dígitos).', examples: ['1000000001'] })
const unidades = z.string().regex(/^\d+$/, 'monto en unidades mínimas')
export const pin = z.string().regex(/^\d{4}$/, 'el PIN tiene 4 dígitos').meta({ description: 'PIN de 4 dígitos.', examples: ['1234'] })

export const Resumen = z.strictObject({
  cedulas: z.number().int().nonnegative().meta({ description: 'Cuántas cédulas tiene la liquidación (sin las novedades).', examples: [3] }),
  total: unidades.meta({ description: 'Suma de los pagos, en unidades mínimas de la moneda del programa. Será el tope al autorizar (RN-08).', examples: ['69000000'] }),
})
export type Resumen = z.infer<typeof Resumen>

/** CA-02.02 y CA-02.03: `disponible` con su monto, o ya pagado con `monto=null`. */
export const Pago = z.union([
  z.strictObject({
    documento,
    disponible: z.literal(true).meta({ description: 'La cédula tiene un pago por cobrar.' }),
    monto: unidades.meta({ description: 'Monto a pagar en unidades mínimas.', examples: ['23000000'] }),
    novedad: z.boolean().meta({ description: 'Es un retroactivo cargado después de aprobar el permiso: el tope no lo incluye (CA-02.07).' }),
  }),
  z.strictObject({
    documento,
    disponible: z.literal(false).meta({ description: 'El pago de esta cédula ya fue cobrado.' }),
    monto: z.null(),
  }),
])
export type Pago = z.infer<typeof Pago>

/** Lo que la plataforma puede saber de una persona: su nombre y si tiene PIN (nunca el PIN). */
export const Persona = z.strictObject({
  documento,
  nombre: z.string().meta({ examples: ['Ana Pérez'] }),
  tienePin: z.boolean(),
})
export type Persona = z.infer<typeof Persona>
export const Personas = z.array(Persona)

/** «Equipo de prueba» hace el papel del gobierno: inscribe a la persona o la actualiza. */
export const Inscripcion = z.strictObject({
  documento,
  nombre: z.string().trim().min(1).max(120).meta({ examples: ['Ana Pérez'] }),
  pin: pin.optional(),
})

export const PedidoPin = z.strictObject({ documento, pin })
export const RespuestaPin = z.strictObject({ valido: z.boolean() })
export const NuevoPin = z.strictObject({ pin })

/** CA-02.04 */
export const MENSAJE_CEDULA_NO_ENCONTRADA = 'Esta cédula no está en la liquidación'

/** Lo que la plataforma entiende de una consulta por cédula. */
export type ConsultaPago = { tipo: 'disponible'; monto: number; novedad: boolean } | { tipo: 'pagado' } | { tipo: 'noExiste' }

/**
 * Lo que guarda el sistema simulado del gobierno y sirve su router (/api/liquidacion). Lo cumplen la
 * versión en la base y la de memoria de las pruebas.
 */
export interface DatosLiquidacion {
  /** Cuántas cédulas y el total sin novedades: será el tope al autorizar (RN-08). */
  resumen(programaId: string): Promise<Resumen>
  /** undefined si la cédula no está. */
  pago(programaId: string, documento: string): Promise<Pago | undefined>
  buscar(documentos: readonly string[]): Persona[] | Promise<Persona[]>
  validarPin(documento: string, pin: string): boolean | Promise<boolean>
  inscribir(documento: string, nombre: string, pin?: string): Persona | Promise<Persona>
  ponerPin(documento: string, pin: string): boolean | Promise<boolean>
  /** Atajo de la demo: el monto de cada persona es el «monto por persona» del programa, si lo tiene. */
  montoPorPrograma: (programaId: string) => Promise<number | null>
}

/** Puerto hacia la liquidación: la plataforma consulta, nunca copia la lista (CA-02.05). */
export interface PuertoLiquidacion {
  resumen(programaId: string): Promise<{ cedulas: number; total: number }>
  pago(programaId: string, documento: string): Promise<ConsultaPago>
  /** Nombre y si tiene PIN de varias cédulas; las que no están, no vienen. */
  personas(cedulas: readonly string[]): Promise<Map<string, Persona>>
  /** ¿Es este el PIN de la persona? false también si no tiene PIN. */
  validarPin(documento: string, pin: string): Promise<boolean>
  /** Inscribe a la persona o, si ya estaba, le cambia el nombre (y el PIN, si llega). */
  inscribir(documento: string, nombre: string, pin?: string): Promise<Persona>
  /** Pone o cambia el PIN; false si la cédula no está en la liquidación. */
  ponerPin(documento: string, pin: string): Promise<boolean>
}
