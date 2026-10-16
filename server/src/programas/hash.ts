// Verificación del hash del callback de interacción (HU-04): se recalcula con el nonce del
// cliente, el nonce del servidor, el interact_ref y la URL del grant, y se compara con las
// variantes base64 (estándar y url-safe, con y sin relleno).
import { createHash, timingSafeEqual } from 'node:crypto'

export interface DatosHash {
  nonceCliente: string
  nonceServidor: string
  interactRef: string
  grantUrl: string
}

export function calcularHash({ nonceCliente, nonceServidor, interactRef, grantUrl }: DatosHash): Buffer {
  return createHash('sha256')
    .update(`${nonceCliente}\n${nonceServidor}\n${interactRef}\n${grantUrl}`)
    .digest()
}

export function hashValido(datos: DatosHash, recibido: string): boolean {
  const esperado = calcularHash(datos)
  const variantes = [
    esperado.toString('base64'),
    esperado.toString('base64').replace(/=+$/, ''),
    esperado.toString('base64url'),
  ]
  const entrada = Buffer.from(recibido)
  return variantes.some((v) => {
    const b = Buffer.from(v)
    return b.length === entrada.length && timingSafeEqual(b, entrada)
  })
}
