// ÚNICO archivo que importa @interledger/open-payments (AD-07).
// El resto del backend habla con este adaptador, nunca con el SDK.
import { createAuthenticatedClient, type AuthenticatedClient } from '@interledger/open-payments'
import { config } from './config.ts'

let cliente: Promise<AuthenticatedClient> | undefined

function llavePrivada(): string {
  if (config.OP_PRIVATE_KEY_BASE64) {
    return Buffer.from(config.OP_PRIVATE_KEY_BASE64, 'base64').toString('utf8')
  }
  if (config.OP_PRIVATE_KEY_PATH) return config.OP_PRIVATE_KEY_PATH
  throw new Error('Falta OP_PRIVATE_KEY_PATH u OP_PRIVATE_KEY_BASE64')
}

/** Cliente autenticado que firma cada petición con Ed25519; se crea una sola vez. */
export function obtenerCliente(): Promise<AuthenticatedClient> {
  if (!config.OP_CLIENT_WALLET_ADDRESS || !config.OP_KEY_ID) {
    throw new Error('Faltan OP_CLIENT_WALLET_ADDRESS u OP_KEY_ID')
  }
  cliente ??= createAuthenticatedClient({
    walletAddressUrl: config.OP_CLIENT_WALLET_ADDRESS,
    keyId: config.OP_KEY_ID,
    privateKey: llavePrivada(),
  })
  return cliente
}

/** Payment pointer con $ pasa a https:// (O1). */
export function normalizarWalletAddress(entrada: string): string {
  const limpia = entrada.trim()
  return limpia.startsWith('$') ? `https://${limpia.slice(1)}` : limpia
}

/** O1: datos públicos de una wallet address (moneda, escala, servidores). */
export async function consultarWallet(url: string) {
  const op = await obtenerCliente()
  return op.walletAddress.get({ url: normalizarWalletAddress(url) })
}
