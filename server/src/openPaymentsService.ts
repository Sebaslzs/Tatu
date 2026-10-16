// ÚNICO archivo que importa @interledger/open-payments (AD-07).
// El resto del backend depende de los puertos (p. ej. PuertoBilleteras), nunca del SDK.
import {
  createAuthenticatedClient,
  createUnauthenticatedClient,
  OpenPaymentsClientError,
  type AuthenticatedClient,
  type UnauthenticatedClient,
} from '@interledger/open-payments'
import { ErrorBilletera, normalizarBilletera, type BilleteraResuelta, type PuertoBilleteras } from './comun/billeteras.ts'

export interface ConfigOpenPayments {
  OP_CLIENT_WALLET_ADDRESS?: string | undefined
  OP_KEY_ID?: string | undefined
  OP_PRIVATE_KEY_PATH?: string | undefined
  OP_PRIVATE_KEY_BASE64?: string | undefined
}

const TIMEOUT_MS = 10_000

/** 4xx del servidor de la billetera = no existe; lo demás (red, 5xx, timeout) = no respondió. */
function esNoEncontrada(e: unknown): boolean {
  return e instanceof OpenPaymentsClientError && e.status !== undefined && e.status >= 400 && e.status < 500
}

export class OpenPaymentsService implements PuertoBilleteras {
  private readonly config: ConfigOpenPayments
  private publico?: Promise<UnauthenticatedClient>
  private autenticado?: Promise<AuthenticatedClient>

  constructor(config: ConfigOpenPayments) {
    this.config = config
  }

  /** O1, CA-01.02/03 y CA-03.02: lee la billetera y su moneda (no requiere llaves). */
  async resolver(url: string): Promise<BilleteraResuelta> {
    const cliente = await (this.publico ??= createUnauthenticatedClient({ requestTimeoutMs: TIMEOUT_MS, logLevel: 'silent' }))
    try {
      const w = await cliente.walletAddress.get({ url: normalizarBilletera(url) })
      return { url: normalizarBilletera(w.id), assetCode: w.assetCode, assetScale: w.assetScale, nombre: w.publicName ?? null }
    } catch (e) {
      if (esNoEncontrada(e)) throw new ErrorBilletera('NoEncontrada', 'La billetera no existe')
      throw new ErrorBilletera('SinRespuesta', 'El servidor de la billetera no respondió')
    }
  }

  /** Cliente que firma cada petición con Ed25519; se crea una sola vez y solo cuando se usa. */
  clienteAutenticado(): Promise<AuthenticatedClient> {
    const { OP_CLIENT_WALLET_ADDRESS, OP_KEY_ID } = this.config
    if (!OP_CLIENT_WALLET_ADDRESS || !OP_KEY_ID) throw new Error('Faltan OP_CLIENT_WALLET_ADDRESS u OP_KEY_ID')
    this.autenticado ??= createAuthenticatedClient({
      walletAddressUrl: OP_CLIENT_WALLET_ADDRESS,
      keyId: OP_KEY_ID,
      privateKey: this.llavePrivada(),
      requestTimeoutMs: TIMEOUT_MS,
      logLevel: 'silent',
    })
    return this.autenticado
  }

  private llavePrivada(): string {
    const { OP_PRIVATE_KEY_BASE64, OP_PRIVATE_KEY_PATH } = this.config
    if (OP_PRIVATE_KEY_BASE64) return Buffer.from(OP_PRIVATE_KEY_BASE64, 'base64').toString('utf8')
    if (OP_PRIVATE_KEY_PATH) return OP_PRIVATE_KEY_PATH
    throw new Error('Falta OP_PRIVATE_KEY_PATH u OP_PRIVATE_KEY_BASE64')
  }
}
