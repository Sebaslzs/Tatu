// Tiempos de la verificación biométrica simulada. Están aquí para ajustarlos sin tocar los componentes.

export type MetodoBiometrico = 'rostro' | 'huella'

/** Cuánto debe sostenerse el rostro alineado en el óvalo antes de procesar. */
export const SOSTENER_ROSTRO_MS = 1500
/** «Reconocimiento facial en proceso…» antes de dar la identidad por verificada. */
export const PROCESAR_ROSTRO_MS = 2500
/** Cuánto se ve el ✓ antes de seguir. */
export const CONFIRMADO_MS = 900
/** La huella se llena mientras «lee». */
export const LEER_HUELLA_MS = 600
/** Cuántas veces por segundo mira el detector el video. */
export const DETECCIONES_POR_SEGUNDO = 10

/** Dónde se sirven el modelo y el runtime de MediaPipe: desde la propia app, sin CDN. */
export const RUTA_MODELO_ROSTRO = '/mediapipe/blaze_face_short_range.tflite'
export const RUTA_WASM = '/mediapipe/wasm'
