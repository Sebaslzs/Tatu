// Doble de prueba de los puertos del banco (permiso del programa y verificación de cuentas): sin red,
// con los valores que el test configura y un registro de cada llamada para afirmar qué se pidió.
import type { PuertoVerificacionCuenta } from '../cuentas/puertos.ts'
import { ErrorOpenPayments } from '../comun/openPayments.ts'
import type { PedidoPermiso, PermisoPendiente, PuertoPermisos, TokenPermiso } from '../programas/puertos.ts'

export const URL_AUTORIZACION = 'https://auth.interledger-test.dev'

export class PermisosFalsos implements PuertoPermisos, PuertoVerificacionCuenta {
  pedidos: PedidoPermiso[] = []
  continuaciones: { interactRef: string }[] = []
  cancelaciones = 0
  rotaciones = 0
  revocaciones = 0
  verificacionesPedidas: { billetera: string; urlRetorno: string }[] = []

  falloAlPedir = false
  falloAlContinuar = false
  falloAlCancelar = false
  /** Lo que el banco dice del dueño de la cuenta al continuar una verificación. */
  cuentaEsDeLaPersona = true
  /** Lo que el banco dice que gastó el permiso (getGrantSpentAmounts). */
  gastado: number | null = null

  private n = 0

  async pedirPermisoPrograma(pedido: PedidoPermiso): Promise<PermisoPendiente> {
    if (this.falloAlPedir) throw new ErrorOpenPayments('SinRespuesta')
    this.pedidos.push(pedido)
    return this.pendiente()
  }

  async continuarPermiso(args: { interactRef: string }): Promise<TokenPermiso> {
    if (this.falloAlContinuar) throw new ErrorOpenPayments('ErrorOpenPayments', 400)
    this.continuaciones.push({ interactRef: args.interactRef })
    return { token: `token-acceso-${this.n}`, urlGestion: `${URL_AUTORIZACION}/token/${this.n}`, expiraEnSeg: 600 }
  }

  async cancelarPermisoPendiente(): Promise<void> {
    if (this.falloAlCancelar) throw new ErrorOpenPayments('SinRespuesta')
    this.cancelaciones += 1
  }

  async rotarToken(): Promise<TokenPermiso> {
    this.rotaciones += 1
    return { token: `token-rotado-${this.rotaciones}`, urlGestion: `${URL_AUTORIZACION}/token/r${this.rotaciones}`, expiraEnSeg: 600 }
  }

  async revocarPermiso(): Promise<void> {
    this.revocaciones += 1
  }

  async gastadoDelPermiso(): Promise<number | null> {
    return this.gastado
  }

  async pedirVerificacionCuenta(args: { billetera: string; urlRetorno: string }): Promise<PermisoPendiente> {
    if (this.falloAlPedir) throw new ErrorOpenPayments('SinRespuesta')
    this.verificacionesPedidas.push({ billetera: args.billetera, urlRetorno: args.urlRetorno })
    return this.pendiente()
  }

  async continuarVerificacion(): Promise<boolean> {
    if (this.falloAlContinuar) throw new ErrorOpenPayments('ErrorOpenPayments', 400)
    return this.cuentaEsDeLaPersona
  }

  async urlAutorizacion(): Promise<string> {
    return URL_AUTORIZACION
  }

  reiniciar(): void {
    Object.assign(this, new PermisosFalsos())
  }

  private pendiente(): PermisoPendiente {
    this.n += 1
    return {
      redirect: `${URL_AUTORIZACION}/interact/${this.n}`,
      nonceCierre: `nonce-servidor-${this.n}`,
      uriContinuacion: `${URL_AUTORIZACION}/continue/${this.n}`,
      tokenContinuacion: `token-continuacion-${this.n}`,
      urlPermiso: URL_AUTORIZACION,
    }
  }
}
