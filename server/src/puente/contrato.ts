// Contrato HTTP del banco puente de Bre-B simulado (AD-21): lo que Tatú espera de un banco o SEDPE
// que participa en Bre-B y opera Rafiki. El simulador lo cumple y el cliente lo valida al recibirlo.
// Tatú nunca guarda el nombre ni la cédula del titular: pregunta «¿es de esta cédula?» y muestra el
// nombre enmascarado.
import { z } from 'zod'
import { documento } from '../liquidacion/contrato.ts'

export const TIPOS_LLAVE = ['cedula', 'celular', 'correo', 'alfanumerica'] as const
export const TipoLlave = z.enum(TIPOS_LLAVE).meta({
  description: 'Tipo de llave Bre-B. Lo elige la persona: nunca se adivina por el formato (RN-14).',
})
export type TipoLlave = z.infer<typeof TipoLlave>

/**
 * Limpia el valor según el tipo que eligió la persona (RN-14). Devuelve null si no tiene la forma de
 * ese tipo.
 */
export function normalizarLlave(tipo: TipoLlave, valor: string): string | null {
  const v = valor.trim()
  switch (tipo) {
    case 'cedula': {
      const limpio = v.replace(/[\s.-]/g, '')
      return /^[A-Za-z0-9]{3,20}$/.test(limpio) ? limpio : null
    }
    case 'celular': {
      // Un celular colombiano: 10 dígitos que empiezan por 3 (con o sin +57, espacios o guiones)
      const limpio = v.replace(/[\s()-]/g, '').replace(/^\+?57(?=3\d{9}$)/, '')
      return /^3\d{9}$/.test(limpio) ? limpio : null
    }
    case 'correo': {
      const limpio = v.toLowerCase()
      return limpio.length <= 80 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio) ? limpio : null
    }
    case 'alfanumerica': {
      const limpio = `@${v.replace(/^@/, '')}`.toLowerCase()
      return /^@[a-z0-9._-]{2,30}$/.test(limpio) ? limpio : null
    }
  }
}

/** Una llave del banco: lo que «Equipo de prueba» registra haciendo de banco de cada persona. */
export const Llave = z.strictObject({
  tipo: TipoLlave,
  valor: z.string().trim().min(3).max(80),
  documentoTitular: documento,
  nombreTitular: z.string().trim().min(1).max(120),
  billetera: z.string().trim().regex(/^https:\/\//, 'la billetera va en forma https://'),
})
export type Llave = z.infer<typeof Llave>
export const Llaves = z.array(Llave)

/** Lo que el banco responde a cualquiera que consulta una llave: a dónde llega y el titular enmascarado. */
export const Resolucion = z.strictObject({
  tipo: TipoLlave,
  valor: z.string(),
  billetera: z.string().meta({ description: 'Billetera Open Payments a la que llega la llave.' }),
  titular: z.string().meta({ description: 'Nombre del titular enmascarado.', examples: ['Ana P*** G***'] }),
})
export type Resolucion = z.infer<typeof Resolucion>

export const PedidoPertenece = z.strictObject({ documento })
export const Coincidencia = z.strictObject({ pertenece: z.boolean() })

/** Puerto hacia el banco puente: consulta llaves; los métodos de registro son del «equipo de prueba». */
export interface PuertoPuente {
  /** A qué billetera llega la llave y el titular enmascarado; null si no existe en Bre-B. */
  resolverLlave(tipo: TipoLlave, valor: string): Promise<Resolucion | null>
  /** RN-16: ¿el titular de la llave es esta cédula? null si la llave no existe. */
  pertenece(tipo: TipoLlave, valor: string, documento: string): Promise<boolean | null>
  llavesDe(documento: string): Promise<Llave[]>
  registrarLlave(llave: Llave): Promise<Llave>
  /** false si la llave no existía. */
  borrarLlave(tipo: TipoLlave, valor: string): Promise<boolean>
}
