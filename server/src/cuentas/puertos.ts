// Puerto de la verificación de propiedad de una cuenta con Open Payments (HU-07, CA-07.05).
// Solo openPaymentsService.ts conoce el SDK (AD-07).
import type { PermisoPendiente } from '../programas/puertos.ts'

export interface PuertoVerificacionCuenta {
  /** `grant.request` con `subject.sub_ids` = la billetera del beneficiario; interactivo obligatorio. */
  pedirVerificacionCuenta(args: { billetera: string; nonce: string; urlRetorno: string }): Promise<PermisoPendiente>
  /** `grant.continue`; true solo si devuelve el subject y el sub_id es la billetera enlazada. */
  continuarVerificacion(args: { uriContinuacion: string; tokenContinuacion: string; interactRef: string; billetera: string }): Promise<boolean>
  /** URL del servidor de autorización de la billetera: el `grant_url` del hash. */
  urlAutorizacion(billetera: string): Promise<string>
}
