// Doble de prueba del puerto de permisos: sin red, con los valores que el test configura y un
// registro de cada llamada para afirmar qué se pidió al banco.
import type { PedidoPermiso, PermisoPendiente, PuertoPermisos, TokenPermiso } from '../programas/puertos.ts'
import { ErrorOpenPayments } from '../comun/openPayments.ts'

export class PermisosFalsos implements PuertoPermisos {
  pedidos: PedidoPermiso[] = []
  continuaciones: { interactRef: string }[] = []
  cancelaciones = 0
  rotaciones = 0
  revocaciones = 0

  falloAlPedir = false
  falloAlContinuar = false
  falloAlCancelar = false
  /** Lo que el banco dice que gastó el permiso (getGrantSpentAmounts). */
  gastado: number | null = null

  private n = 0

  async pedirPermisoPrograma(pedido: PedidoPermiso): Promise<PermisoPendiente> {
    if (this.falloAlPedir) throw new ErrorOpenPayments('SinRespuesta')
    this.pedidos.push(pedido)
    this.n += 1
    return {
      redirect: `https://auth.interledger-test.dev/interact/${this.n}`,
      nonceCierre: `nonce-servidor-${this.n}`,
      uriContinuacion: `https://auth.interledger-test.dev/continue/${this.n}`,
      tokenContinuacion: `token-continuacion-${this.n}`,
      urlPermiso: 'https://auth.interledger-test.dev',
    }
  }

  async continuarPermiso(args: { interactRef: string }): Promise<TokenPermiso> {
    if (this.falloAlContinuar) throw new ErrorOpenPayments('ErrorOpenPayments', 400)
    this.continuaciones.push({ interactRef: args.interactRef })
    return { token: `token-acceso-${this.n}`, urlGestion: `https://auth.interledger-test.dev/token/${this.n}`, expiraEnSeg: 600 }
  }

  async cancelarPermisoPendiente(): Promise<void> {
    if (this.falloAlCancelar) throw new ErrorOpenPayments('SinRespuesta')
    this.cancelaciones += 1
  }

  async rotarToken(): Promise<TokenPermiso> {
    this.rotaciones += 1
    return { token: `token-rotado-${this.rotaciones}`, urlGestion: `https://auth.interledger-test.dev/token/r${this.rotaciones}`, expiraEnSeg: 600 }
  }

  async revocarPermiso(): Promise<void> {
    this.revocaciones += 1
  }

  async gastadoDelPermiso(): Promise<number | null> {
    return this.gastado
  }

  reiniciar(): void {
    Object.assign(this, new PermisosFalsos())
  }
}
