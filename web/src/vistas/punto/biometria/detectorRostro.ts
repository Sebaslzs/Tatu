// Carga diferida de MediaPipe Face Detector (BlazeFace de corto alcance), servido desde la propia app.
// Queda en su propio chunk: solo se descarga cuando el punto llega a verificar a alguien.
import type { FaceDetector } from '@mediapipe/tasks-vision'
import { RUTA_MODELO_ROSTRO, RUTA_WASM } from './pasos'

let carga: Promise<FaceDetector> | null = null

/** El detector listo para `detectForVideo`. Intenta GPU y, si falla, CPU. Se reutiliza entre cobros. */
export function cargarDetector(): Promise<FaceDetector> {
  carga ??= (async () => {
    const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision')
    const vision = await FilesetResolver.forVisionTasks(RUTA_WASM)
    const crear = (delegate: 'GPU' | 'CPU') =>
      FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: RUTA_MODELO_ROSTRO, delegate },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.5,
      })
    try {
      return await crear('GPU')
    } catch {
      return await crear('CPU')
    }
  })().catch((e: unknown) => {
    // Un fallo no queda guardado: el próximo intento vuelve a cargar
    carga = null
    throw e
  })
  return carga
}
