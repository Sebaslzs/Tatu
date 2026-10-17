// Copia el runtime WASM de MediaPipe desde node_modules a public/mediapipe/wasm, para servirlo desde la
// propia app (sin CDN: la demo funciona sin internet). Corre antes de `dev` y de `build`.
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const origen = resolve(web, 'node_modules/@mediapipe/tasks-vision/wasm')
const destino = resolve(web, 'public/mediapipe/wasm')

if (!existsSync(origen)) {
  console.warn('[mediapipe] No está instalado @mediapipe/tasks-vision: el rostro no estará disponible (la huella sí).')
} else {
  mkdirSync(destino, { recursive: true })
  cpSync(origen, destino, { recursive: true })
}

if (!existsSync(resolve(web, 'public/mediapipe/blaze_face_short_range.tflite'))) {
  console.warn('[mediapipe] Falta public/mediapipe/blaze_face_short_range.tflite: el rostro no estará disponible (la huella sí).')
}
