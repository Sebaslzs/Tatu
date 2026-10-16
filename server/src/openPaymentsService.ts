// Adaptador de Open Payments: el ÚNICO archivo que importa @interledger/open-payments (AD-07).
// El resto del backend depende de los puertos (PuertoBilleteras, PuertoPermisos), nunca del SDK.
import { createPrivateKey, type KeyObject } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  createAuthenticatedClient,
  createUnauthenticatedClient,
  isFinalizedGrantWithAccessToken,
  isFinalizedGrantWithSubject,
  isPendingGrant,
  OpenPaymentsClientError,
  type AuthenticatedClient,
  type UnauthenticatedClient,
  type WalletAddress,
} from '@interledger/open-payments'
import { ErrorBilletera, mismaBilletera, normalizarBilletera, type BilleteraResuelta, type PuertoBilleteras } from './comun/billeteras.ts'
import { log } from './comun/log.ts'
import { ErrorOpenPayments, montoOP } from './comun/openPayments.ts'
import type { PagoEntrante, PagoSaliente, PuertoPagos } from './cobros/puertos.ts'
import type { Moneda } from './comun/montos.ts'
import type { PuertoVerificacionCuenta } from './cuentas/puertos.ts'
import type { PedidoPermiso, PermisoPendiente, PuertoPermisos, TokenPermiso } from './programas/puertos.ts'

export interface ConfigOpenPayments {
  OP_CLIENT_WALLET_ADDRESS?: string | undefined
  OP_KEY_ID?: string | undefined
  OP_PRIVATE_KEY_PATH?: string | undefined
  OP_PRIVATE_KEY_BASE64?: string | undefined
}

const TIMEOUT_MS = 15_000
const CINCO_MIN = 5 * 60_000
const RAIZ_SERVER = resolve(import.meta.dirname, '..')

type Operacion = 'pagoSaliente' | 'otra'

/**
 * Traduce un fallo del SDK al error del dominio. Solo conserva status, code y description: nunca
 * tokens (RNF-09).
 */
export function traducir(e: unknown, operacion: Operacion): ErrorOpenPayments {
  if (e instanceof ErrorOpenPayments) return e
  if (e instanceof OpenPaymentsClientError) {
    const { status, code, description } = e
    log.warn('Error de Open Payments', { status, code, description, operacion })
    // La Test Wallet responde 403 «Inactive Token» (no 401) cuando el token del permiso venció: es
    // TokenVencido y se rota; confundirlo con el tope dejaría el programa sin pagar.
    if (status === 401 || (status === 403 && /inactive token/i.test(description ?? ''))) {
      return new ErrorOpenPayments('TokenVencido', status, code, description)
    }
    // Cualquier otro 403 al crear el pago saliente es el candidato a InsufficientGrant (el tope)
    if (status === 403 && operacion === 'pagoSaliente') return new ErrorOpenPayments('TopeSuperado', status, code, description)
    // Sin status (tiempo agotado, red) o un 5xx: no se sabe si pasó; nunca se marca Fallido por esto
    if (status === undefined || status >= 500) return new ErrorOpenPayments('SinRespuesta', status, code, description)
    return new ErrorOpenPayments('ErrorOpenPayments', status, code, description)
  }
  log.warn('Error sin respuesta de Open Payments', { error: e, operacion })
  return new ErrorOpenPayments('SinRespuesta', undefined, undefined, (e as Error)?.message)
}

/** 4xx del servidor de la billetera = no existe; lo demás (red, 5xx, timeout) = no respondió. */
const esNoEncontrada = (e: unknown) => e instanceof OpenPaymentsClientError && e.status !== undefined && e.status >= 400 && e.status < 500

interface WalletOP {
  id: string
  codigoMoneda: string
  escala: number
  authServer: string
  resourceServer: string
  nombre: string | null
}

const aWallet = (w: WalletAddress): WalletOP => ({
  id: w.id,
  codigoMoneda: w.assetCode,
  escala: w.assetScale,
  authServer: w.authServer,
  resourceServer: w.resourceServer,
  nombre: w.publicName ?? null,
})

function interaccion({ nonce, urlRetorno }: Pick<PedidoPermiso, 'nonce' | 'urlRetorno'>) {
  return { start: ['redirect' as const], finish: { method: 'redirect' as const, uri: urlRetorno, nonce } }
}

export class OpenPaymentsService implements PuertoBilleteras, PuertoPermisos, PuertoVerificacionCuenta, PuertoPagos {
  private readonly config: ConfigOpenPayments
  private publico?: Promise<UnauthenticatedClient>
  private autenticado?: Promise<AuthenticatedClient>
  private readonly wallets = new Map<string, { wallet: WalletOP; vence: number }>()

  constructor(config: ConfigOpenPayments) {
    this.config = config
  }

  // ---------------------------------------------------------------------------------------------
  // Billeteras (HU-01, HU-03)
  // ---------------------------------------------------------------------------------------------

  async resolver(url: string): Promise<BilleteraResuelta> {
    try {
      const w = await this.leerWallet(url)
      return { url: normalizarBilletera(w.id), assetCode: w.codigoMoneda, assetScale: w.escala, nombre: w.nombre }
    } catch (e) {
      if (esNoEncontrada(e)) throw new ErrorBilletera('NoEncontrada', 'La billetera no existe')
      throw new ErrorBilletera('SinRespuesta', 'El servidor de la billetera no respondió')
    }
  }

  /** walletAddress.get con caché de 5 minutos. Es público: no necesita la llave. */
  private async leerWallet(direccion: string): Promise<WalletOP> {
    const url = normalizarBilletera(direccion)
    const guardada = this.wallets.get(url)
    if (guardada && guardada.vence > Date.now()) return guardada.wallet
    const cliente = await this.clientePublico()
    const wallet = aWallet(await cliente.walletAddress.get({ url }))
    this.wallets.set(url, { wallet, vence: Date.now() + CINCO_MIN })
    return wallet
  }

  private clientePublico(): Promise<UnauthenticatedClient> {
    this.publico ??= createUnauthenticatedClient({ requestTimeoutMs: TIMEOUT_MS, logLevel: 'silent' })
    this.publico.catch(() => (this.publico = undefined))
    return this.publico
  }

  // ---------------------------------------------------------------------------------------------
  // Permiso del programa (HU-04 a HU-06, HU-17)
  // ---------------------------------------------------------------------------------------------

  async pedirPermisoPrograma(pedido: PedidoPermiso): Promise<PermisoPendiente> {
    const wallet = await this.walletOP(pedido.billetera)
    const g = await this.llamar('otra', (c) =>
      c.grant.request(
        { url: wallet.authServer },
        {
          access_token: {
            access: [
              {
                type: 'outgoing-payment',
                actions: ['create', 'read'],
                identifier: wallet.id,
                limits: { debitAmount: montoOP(pedido.tope, pedido.moneda) },
              },
            ],
          },
          interact: interaccion(pedido),
        },
      ),
    )
    if (!isPendingGrant(g)) throw new ErrorOpenPayments('ErrorOpenPayments', undefined, undefined, 'El permiso no quedó pendiente de aprobación')
    return {
      redirect: g.interact.redirect,
      nonceCierre: g.interact.finish,
      uriContinuacion: g.continue.uri,
      tokenContinuacion: g.continue.access_token.value,
      urlPermiso: wallet.authServer,
    }
  }

  async continuarPermiso(args: { uriContinuacion: string; tokenContinuacion: string; interactRef: string }): Promise<TokenPermiso> {
    const g = await this.llamar('otra', (c) =>
      c.grant.continue({ url: args.uriContinuacion, accessToken: args.tokenContinuacion }, { interact_ref: args.interactRef }),
    )
    if (!isFinalizedGrantWithAccessToken(g)) {
      throw new ErrorOpenPayments('ErrorOpenPayments', undefined, undefined, 'La continuación no entregó un token de acceso')
    }
    return { token: g.access_token.value, urlGestion: g.access_token.manage, expiraEnSeg: g.access_token.expires_in }
  }

  async cancelarPermisoPendiente(args: { uriContinuacion: string; tokenContinuacion: string }): Promise<void> {
    await this.llamar('otra', (c) => c.grant.cancel({ url: args.uriContinuacion, accessToken: args.tokenContinuacion }))
  }

  async rotarToken(args: { urlGestion: string; token: string }): Promise<TokenPermiso> {
    const r = await this.llamar('otra', (c) => c.token.rotate({ url: args.urlGestion, accessToken: args.token }))
    return { token: r.access_token.value, urlGestion: r.access_token.manage, expiraEnSeg: r.access_token.expires_in }
  }

  async revocarPermiso(args: { urlGestion: string; token: string }): Promise<void> {
    await this.llamar('otra', (c) => c.token.revoke({ url: args.urlGestion, accessToken: args.token }))
  }

  async gastadoDelPermiso(args: { billeteraPrograma: string; token: string }): Promise<number | null> {
    const wallet = await this.walletOP(args.billeteraPrograma)
    const r = await this.llamar('otra', (c) => c.outgoingPayment.getGrantSpentAmounts({ url: wallet.resourceServer, accessToken: args.token }))
    return r.spentDebitAmount ? Number(r.spentDebitAmount.value) : null
  }

  // ---------------------------------------------------------------------------------------------
  // Pagos (HU-09, HU-12)
  // ---------------------------------------------------------------------------------------------

  /** Token de pago entrante por billetera de destino: permisos no interactivos, se reutilizan mientras duren. */
  private readonly tokensEntrantes = new Map<string, { token: string; vence: number }>()

  private async tokenEntrante(wallet: WalletOP): Promise<string> {
    const guardado = this.tokensEntrantes.get(wallet.id)
    if (guardado && guardado.vence > Date.now()) return guardado.token
    const g = await this.llamar('otra', (c) =>
      c.grant.request({ url: wallet.authServer }, { access_token: { access: [{ type: 'incoming-payment', actions: ['create', 'read'] }] } }),
    )
    if (!isFinalizedGrantWithAccessToken(g)) {
      throw new ErrorOpenPayments('ErrorOpenPayments', undefined, undefined, 'El permiso de pago entrante pidió interacción')
    }
    const duracion = (g.access_token.expires_in ?? 300) * 1000
    this.tokensEntrantes.set(wallet.id, { token: g.access_token.value, vence: Date.now() + duracion - 30_000 })
    return g.access_token.value
  }

  async crearPagoEntrante(args: { billetera: string; monto: number; moneda: Moneda; referencia: string; descripcion: string }): Promise<PagoEntrante> {
    const wallet = await this.walletOP(args.billetera)
    const token = await this.tokenEntrante(wallet)
    const p = await this.llamar('otra', (c) =>
      c.incomingPayment.create(
        { url: wallet.resourceServer, accessToken: token },
        {
          walletAddress: wallet.id,
          incomingAmount: montoOP(args.monto, args.moneda),
          metadata: { description: args.descripcion, referencia: args.referencia },
        },
      ),
    )
    return { id: p.id, completado: p.completed, recibido: p.receivedAmount.value, esperado: p.incomingAmount?.value }
  }

  async leerPagoEntrante(args: { url: string; billetera: string }): Promise<PagoEntrante> {
    const wallet = await this.walletOP(args.billetera)
    const token = await this.tokenEntrante(wallet)
    const p = await this.llamar('otra', (c) => c.incomingPayment.get({ url: args.url, accessToken: token }))
    return { id: p.id, completado: p.completed, recibido: p.receivedAmount.value, esperado: p.incomingAmount?.value }
  }

  async crearPagoSaliente(args: {
    billeteraPrograma: string
    token: string
    urlPagoEntrante: string
    monto: number
    moneda: Moneda
    referencia: string
  }): Promise<PagoSaliente> {
    const wallet = await this.walletOP(args.billeteraPrograma)
    const p = await this.llamar('pagoSaliente', (c) =>
      c.outgoingPayment.create(
        { url: wallet.resourceServer, accessToken: args.token },
        {
          walletAddress: wallet.id,
          incomingPayment: args.urlPagoEntrante,
          debitAmount: montoOP(args.monto, args.moneda),
          metadata: { referencia: args.referencia },
        },
      ),
    )
    return { id: p.id, fallido: p.failed, debitado: p.debitAmount.value, enviado: p.sentAmount.value }
  }

  async leerPagoSaliente(args: { url: string; token: string }): Promise<PagoSaliente> {
    const p = await this.llamar('otra', (c) => c.outgoingPayment.get({ url: args.url, accessToken: args.token }))
    return { id: p.id, fallido: p.failed, debitado: p.debitAmount.value, enviado: p.sentAmount.value }
  }

  // ---------------------------------------------------------------------------------------------
  // Verificación de la cuenta del beneficiario (HU-07)
  // ---------------------------------------------------------------------------------------------

  async pedirVerificacionCuenta(args: { billetera: string; nonce: string; urlRetorno: string }): Promise<PermisoPendiente> {
    const wallet = await this.walletOP(args.billetera)
    const g = await this.llamar('otra', (c) =>
      c.grant.request({ url: wallet.authServer }, { subject: { sub_ids: [{ id: wallet.id, format: 'uri' }] }, interact: interaccion(args) }),
    )
    if (!isPendingGrant(g)) throw new ErrorOpenPayments('ErrorOpenPayments', undefined, undefined, 'La verificación no quedó pendiente')
    return {
      redirect: g.interact.redirect,
      nonceCierre: g.interact.finish,
      uriContinuacion: g.continue.uri,
      tokenContinuacion: g.continue.access_token.value,
      urlPermiso: wallet.authServer,
    }
  }

  async continuarVerificacion(args: { uriContinuacion: string; tokenContinuacion: string; interactRef: string; billetera: string }): Promise<boolean> {
    const g = await this.llamar('otra', (c) =>
      c.grant.continue({ url: args.uriContinuacion, accessToken: args.tokenContinuacion }, { interact_ref: args.interactRef }),
    )
    if (!isFinalizedGrantWithSubject(g)) return false
    return g.subject.sub_ids.some((s) => mismaBilletera(s.id, args.billetera))
  }

  async urlAutorizacion(billetera: string): Promise<string> {
    return (await this.walletOP(billetera)).authServer
  }

  // ---------------------------------------------------------------------------------------------
  // Cliente autenticado y llave
  // ---------------------------------------------------------------------------------------------

  /** Los servidores de una billetera, traduciendo el fallo al error del dominio. */
  private async walletOP(direccion: string): Promise<WalletOP> {
    try {
      return await this.leerWallet(direccion)
    } catch (e) {
      throw traducir(e, 'otra')
    }
  }

  private async llamar<T>(operacion: Operacion, fn: (c: AuthenticatedClient) => Promise<T>): Promise<T> {
    const cliente = await this.clienteAutenticado()
    try {
      return await fn(cliente)
    } catch (e) {
      throw traducir(e, operacion)
    }
  }

  /** Cliente que firma cada petición con Ed25519; se crea una sola vez y solo cuando se usa. */
  clienteAutenticado(): Promise<AuthenticatedClient> {
    if (!this.autenticado) {
      this.autenticado = (async () => {
        const { OP_CLIENT_WALLET_ADDRESS, OP_KEY_ID } = this.config
        const faltan = [!OP_CLIENT_WALLET_ADDRESS && 'OP_CLIENT_WALLET_ADDRESS', !OP_KEY_ID && 'OP_KEY_ID'].filter(Boolean)
        if (faltan.length) throw new ErrorOpenPayments('NoConfigurado', undefined, undefined, `Faltan en el .env: ${faltan.join(', ')}`)
        return createAuthenticatedClient({
          walletAddressUrl: OP_CLIENT_WALLET_ADDRESS!,
          keyId: OP_KEY_ID!,
          privateKey: this.cargarLlave(),
          requestTimeoutMs: TIMEOUT_MS,
          logLevel: 'silent',
        })
      })()
      this.autenticado.catch(() => (this.autenticado = undefined))
    }
    return this.autenticado
  }

  /** La llave privada: OP_PRIVATE_KEY_BASE64 (el PEM en base64, o el DER pkcs8) u OP_PRIVATE_KEY_PATH. */
  private cargarLlave(): KeyObject {
    const { OP_PRIVATE_KEY_BASE64, OP_PRIVATE_KEY_PATH } = this.config
    let llave: KeyObject
    if (OP_PRIVATE_KEY_BASE64) {
      const bytes = Buffer.from(OP_PRIVATE_KEY_BASE64, 'base64')
      const texto = bytes.toString('utf8')
      llave = texto.includes('-----BEGIN') ? createPrivateKey(texto) : createPrivateKey({ key: bytes, format: 'der', type: 'pkcs8' })
    } else if (OP_PRIVATE_KEY_PATH) {
      llave = createPrivateKey(readFileSync(resolve(RAIZ_SERVER, OP_PRIVATE_KEY_PATH)))
    } else {
      throw new ErrorOpenPayments('NoConfigurado', undefined, undefined, 'Falta OP_PRIVATE_KEY_BASE64 u OP_PRIVATE_KEY_PATH en el .env')
    }
    if (llave.asymmetricKeyType !== 'ed25519') {
      throw new ErrorOpenPayments('NoConfigurado', undefined, undefined, 'La llave privada no es Ed25519')
    }
    return llave
  }
}
