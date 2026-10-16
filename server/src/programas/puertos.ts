// Puerto del permiso con tope en el banco (Open Payments). Los servicios del programa dependen de
// esta interfaz; solo openPaymentsService.ts conoce el SDK (AD-07).
import type { Moneda } from '../comun/montos.ts'

export interface PermisoPendiente {
  /** Enlace de consentimiento: se devuelve a la entidad, nunca se guarda. */
  redirect: string
  /** `interact.finish` de la respuesta: el nonce del servidor (nonce_cierre). */
  nonceCierre: string
  uriContinuacion: string
  tokenContinuacion: string
  /** URL del servidor de autorización: el `grant_url` del hash (url_permiso). */
  urlPermiso: string
}

export interface TokenPermiso {
  token: string
  urlGestion: string
  expiraEnSeg?: number | undefined
}

export interface PedidoPermiso {
  billetera: string
  /** Tope en unidades mínimas. */
  tope: number
  moneda: Moneda
  /** Nonce propio del cliente (`nonce_cliente`). */
  nonce: string
  /** Adónde vuelve la entidad tras aprobar: `GET /api/callback/:id`. */
  urlRetorno: string
}

export interface PuertoPermisos {
  /** `grant.request` de outgoing-payment con tope y sin receptor fijo (AD-09), interactivo. */
  pedirPermisoPrograma(pedido: PedidoPermiso): Promise<PermisoPendiente>
  /** `grant.continue` con el `interact_ref`; exige un permiso con token. */
  continuarPermiso(args: { uriContinuacion: string; tokenContinuacion: string; interactRef: string }): Promise<TokenPermiso>
  /** `grant.cancel`: solo para una aprobación pendiente. */
  cancelarPermisoPendiente(args: { uriContinuacion: string; tokenContinuacion: string }): Promise<void>
  /** `token.rotate` (HU-06). */
  rotarToken(args: { urlGestion: string; token: string }): Promise<TokenPermiso>
  /** `token.revoke` (HU-17). */
  revocarPermiso(args: { urlGestion: string; token: string }): Promise<void>
  /** `getGrantSpentAmounts` → lo gastado del permiso; null si todavía no gastó nada. */
  gastadoDelPermiso(args: { billeteraPrograma: string; token: string }): Promise<number | null>
}
