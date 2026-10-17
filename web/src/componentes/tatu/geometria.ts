// Medidas de los dibujos de web/public/brand para animarlos sin saltos.
//
// El logo (claro, pagado y error) es el mismo dibujo: en tatu-logo-claro.svg ocupa una caja dentro de
// su viewBox cuadrado; pagado y error son esa misma caja recortada. Las poses salen de la lámina
// tatu-animacion.webp (1600 × 900 px), donde cada pose tiene su propia ventana porque se pisan.

export const LOGO = {
  claro: '/brand/tatu-logo-claro.svg',
  pagado: '/brand/tatu-logo-pagado.svg',
  error: '/brand/tatu-logo-error.svg',
}

/** Dónde queda el dibujo dentro del cuadro de tatu-logo-claro.svg, en fracciones del lado. */
export const DIBUJO_LOGO = { x: 24 / 1170, y: 52 / 1170, ancho: 1110 / 1170, alto: 979 / 1170 }

/** Centro de la bolita del logo (eje de giro) y línea del suelo, en fracciones del lado. */
export const CENTRO_GIRO = { x: 0.495, y: 0.463 }
export const SUELO_LOGO = 1031 / 1170

export const LAMINA = { url: '/brand/tatu-animacion.webp', ancho: 1600, alto: 900, suelo: 415 }

/** Alto de la bolita en la lámina y en el logo (fracción del lado): fijan la escala de las poses. */
export const BOLITA_LAMINA = 258
export const BOLITA_LOGO = 979 / 1170

export interface Pose {
  /** Ventana de la pose en la lámina, en píxeles. */
  x0: number
  y0: number
  x1: number
  y1: number
  /** Centro horizontal del dibujo: se alinea con el centro del logo. */
  centro: number
}

/** De pie, arquea el lomo, se dobla y bolita. */
export const POSES: readonly Pose[] = [
  { x0: 20, y0: 150, x1: 478, y1: 440, centro: 250 },
  { x0: 478, y0: 150, x1: 895, y1: 450, centro: 683 },
  { x0: 895, y0: 130, x1: 1225, y1: 450, centro: 1059 },
  { x0: 1235, y0: 140, x1: 1530, y1: 440, centro: 1375 },
]
