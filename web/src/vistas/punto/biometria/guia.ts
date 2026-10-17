// Regla de posición del rostro en el óvalo: función pura, sin video ni detector, para probarla sola.

/** Caja del rostro en píxeles del video, como la entrega el detector. */
export interface CajaRostro {
  x: number
  y: number
  ancho: number
  alto: number
}

/** Tamaño real del video y del recuadro donde se muestra con `object-cover`. */
export interface Dimensiones {
  ancho: number
  alto: number
}

export type Guia = 'sinRostro' | 'varios' | 'descentrado' | 'lejos' | 'cerca' | 'alineado'

export const MENSAJES_GUIA: Record<Guia, string> = {
  sinRostro: 'Ubica tu rostro dentro del óvalo',
  varios: 'Solo una persona frente a la cámara',
  descentrado: 'Centra tu rostro en el óvalo',
  lejos: 'Acércate un poco',
  cerca: 'Aléjate un poco',
  alineado: 'Así está bien, no te muevas…',
}

/** Centro del óvalo y tolerancias, en fracción del recuadro visible. */
const CENTRO = { x: 0.5, y: 0.45 }
const TOLERANCIA = { x: 0.12, y: 0.12 }
const ANCHO_MIN = 0.28
const ANCHO_MAX = 0.68

/**
 * Pasa una caja del video al recuadro visible. Con `object-cover` el video se escala hasta cubrir el
 * recuadro y se recorta el sobrante centrado; el espejo no cambia nada porque la regla es simétrica.
 */
export function aVisible(caja: CajaRostro, video: Dimensiones, vista: Dimensiones): CajaRostro {
  const escala = Math.max(vista.ancho / video.ancho, vista.alto / video.alto)
  const recorteX = (video.ancho * escala - vista.ancho) / 2
  const recorteY = (video.alto * escala - vista.alto) / 2
  return {
    x: (caja.x * escala - recorteX) / vista.ancho,
    y: (caja.y * escala - recorteY) / vista.alto,
    ancho: (caja.ancho * escala) / vista.ancho,
    alto: (caja.alto * escala) / vista.alto,
  }
}

/** Qué decirle a la persona según los rostros detectados (ya en coordenadas del recuadro visible). */
export function evaluarRostro(cajas: readonly CajaRostro[]): Guia {
  if (cajas.length === 0) return 'sinRostro'
  if (cajas.length > 1) return 'varios'
  const [c] = cajas as [CajaRostro]
  if (c.ancho < ANCHO_MIN) return 'lejos'
  if (c.ancho > ANCHO_MAX) return 'cerca'
  const centroX = c.x + c.ancho / 2
  const centroY = c.y + c.alto / 2
  if (Math.abs(centroX - CENTRO.x) > TOLERANCIA.x || Math.abs(centroY - CENTRO.y) > TOLERANCIA.y) return 'descentrado'
  return 'alineado'
}
