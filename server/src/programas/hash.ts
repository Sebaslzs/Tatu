// Verificación del hash del callback de interacción (HU-04, CA-04.03):
//
//   hash = base64( sha256( nonce_cliente \n nonce_cierre \n interact_ref \n grant_url ) )
//
// La documentación oficial es inconsistente (ejemplo en base64url, código en base64 estándar), así
// que se aceptan las tres variantes —estándar con y sin `=`, y base64url— y el `grant_url` con y
// sin barra final.
import { createHash, timingSafeEqual } from 'node:crypto'

export interface DatosHash {
  nonceCliente: string
  nonceCierre: string
  interactRef: string
  urlPermiso: string
}

export type Variante = 'estandar-con-padding' | 'estandar-sin-padding' | 'base64url'

export interface CoincidenciaHash {
  variante: Variante
  grantUrl: string
}

export function candidatos({ nonceCliente, nonceCierre, interactRef, urlPermiso }: DatosHash) {
  const sinBarra = urlPermiso.replace(/\/+$/, '')
  const lista: (CoincidenciaHash & { valor: string })[] = []
  for (const grantUrl of [sinBarra, `${sinBarra}/`]) {
    const base = `${nonceCliente}\n${nonceCierre}\n${interactRef}\n${grantUrl}`
    const crudo = createHash('sha256').update(base).digest('base64')
    lista.push({ variante: 'estandar-con-padding', grantUrl, valor: crudo })
    lista.push({ variante: 'estandar-sin-padding', grantUrl, valor: crudo.replace(/=+$/, '') })
    lista.push({ variante: 'base64url', grantUrl, valor: crudo.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') })
  }
  return lista
}

function igualesSeguro(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

/** Devuelve la variante que coincidió, o null si ninguna (callback inválido). */
export function verificarHash(recibido: string, datos: DatosHash): CoincidenciaHash | null {
  if (!recibido) return null
  for (const c of candidatos(datos)) {
    if (igualesSeguro(c.valor, recibido)) return { variante: c.variante, grantUrl: c.grantUrl }
  }
  return null
}
