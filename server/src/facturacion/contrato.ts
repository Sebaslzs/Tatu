// Contrato HTTP con el sistema externo de facturación (HU-27). Tatú no factura: cuando un retiro con
// venta queda Pagado, envía los datos básicos de la venta para que el software de facturación del
// comercio genere la factura electrónica o el documento equivalente POS. Lo cumple el simulador y lo
// valida el cliente. Las descripciones alimentan OpenAPI.
//
// Lo que Tatú NO manda porque no lo tiene ni lo debe pedir en la caja: el detalle de productos, los
// impuestos (IVA o impuesto al consumo) y la resolución de facturación del comercio. Los completa el
// sistema de facturación con su propio catálogo, usando `idVenta` para no facturar dos veces.
import { z } from 'zod'

const unidades = z.string().regex(/^\d+$/)
const Monto = z.strictObject({
  valor: unidades.meta({ description: 'Entero en unidades mínimas, como texto.', examples: ['5000000'] }),
  assetCode: z.string().regex(/^[A-Z]{3}$/).meta({ examples: ['COP'] }),
  assetScale: z.number().int().min(0).meta({ examples: [2] }),
})

export const SolicitudFactura = z.strictObject({
  idVenta: z.uuid().meta({ description: 'Identificador de la venta en Tatú. Es también la cabecera `Idempotency-Key`: repetirla no crea otra factura.' }),
  fecha: z.string().meta({ description: 'Cuándo quedó pagado el retiro (ISO 8601, UTC): es el momento de la venta.', examples: ['2026-10-16T15:00:04.000Z'] }),
  establecimiento: z
    .strictObject({
      puntoId: z.uuid(),
      nombre: z.string().meta({ examples: ['Tienda Marta'] }),
      direccion: z.string().meta({ examples: ['Calle 45 # 12-30, Bogotá'] }),
    })
    .meta({ description: 'El punto que vendió. Su NIT y su resolución los tiene el sistema de facturación del comercio.' }),
  comprador: z
    .strictObject({
      tipoDocumento: z.enum(['CC', 'TI', 'CE', 'PPT', 'PA']),
      numeroDocumento: z.string().meta({ examples: ['1000000003'] }),
      nombre: z.string().nullable().meta({ description: 'De la liquidación; `null` si no respondió (se puede facturar a consumidor final).', examples: ['Jorge Ruiz'] }),
    })
    .meta({ description: 'La persona que compró: la factura va a su nombre como consumidor final.' }),
  venta: z.strictObject({
    valor: Monto.meta({ description: 'Total de la compra, impuestos incluidos.' }),
    descripcion: z.string().nullable().meta({ description: 'Lo que escribió el punto, si escribió algo (p. ej. «Mercado»).', examples: ['Mercado'] }),
  }),
  medioDePago: z
    .strictObject({
      tipo: z.literal('subsidio'),
      referenciaCobro: z.string().meta({ description: 'Referencia del retiro en Tatú y en la billetera del punto.', examples: ['SUB-0007'] }),
      programa: z.strictObject({ id: z.uuid(), nombre: z.string() }),
      entidad: z.strictObject({ nombre: z.string(), tipoDocumento: z.enum(['NIT', 'OTRO']), documento: z.string() }).meta({ description: 'Quién paga el subsidio.' }),
      valorRetiro: Monto.meta({ description: 'Todo lo que salió del subsidio en ese retiro (compra + efectivo).' }),
      efectivoEntregado: Monto.meta({ description: 'Lo que el punto entregó en efectivo: valorRetiro − venta.valor. No es parte de la factura.' }),
    })
    .meta({ description: 'La compra se pagó con el subsidio: el punto ya recibió el retiro completo en su billetera.' }),
})
export type SolicitudFactura = z.infer<typeof SolicitudFactura>

export const RespuestaFactura = z.object({
  id: z.string().min(1).meta({ description: 'Identificador de la solicitud en el sistema de facturación.', examples: ['FAC-0001'] }),
  recibidaEn: z.string().optional(),
})

/** Lo que Tatú entiende de un envío. Nunca lanza: toda falla es «no disponible». */
export type ResultadoEnvio =
  | { tipo: 'aceptada'; referencia: string }
  /** El sistema la rechazó por sus datos (4xx): reintentar igual no sirve hasta revisarla. */
  | { tipo: 'rechazada'; mensaje: string }
  /** Caído, lento o con 5xx: se reintenta después; como va con la misma llave, no duplica. */
  | { tipo: 'noDisponible'; mensaje: string }

export interface PuertoFacturacion {
  enviar(solicitud: SolicitudFactura): Promise<ResultadoEnvio>
}
