// La persona elige cómo verificarse en el punto: rostro o huella (alternativas, no pasos seguidos).
// Al terminar con éxito llama `alVerificar(metodo)`; quien la monta confirma el cobro con la API.
// Solo existe en el retiro en un punto: cobrar a la cuenta no pide biometría.
import { Fingerprint, ScanFace } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { CamaraRostro } from './CamaraRostro'
import { cargarDetector } from './detectorRostro'
import { LectorHuella } from './LectorHuella'
import type { MetodoBiometrico } from './pasos'

export function VerificacionBiometrica({ alVerificar, deshabilitado = false }: { alVerificar: (metodo: MetodoBiometrico) => void; deshabilitado?: boolean }) {
  const [metodo, setMetodo] = useState<MetodoBiometrico | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // Mientras la persona elige, se descarga el detector: el rostro arranca sin esperar
  useEffect(() => {
    cargarDetector().catch(() => undefined)
  }, [])

  const rostroNoDisponible = useCallback((motivo: string) => {
    setAviso(motivo)
    setMetodo(null)
  }, [])
  const verificarRostro = useCallback(() => alVerificar('rostro'), [alVerificar])
  const verificarHuella = useCallback(() => alVerificar('huella'), [alVerificar])

  if (metodo === 'rostro') {
    return (
      <div className="flex flex-col gap-3">
        <CamaraRostro alVerificar={verificarRostro} alNoDisponible={rostroNoDisponible} />
        <OtroMetodo alElegir={() => setMetodo(null)} />
      </div>
    )
  }
  if (metodo === 'huella') {
    return (
      <div className="flex flex-col gap-3">
        <LectorHuella alVerificar={verificarHuella} />
        <OtroMetodo alElegir={() => setMetodo(null)} />
      </div>
    )
  }

  const opcion = 'flex flex-1 flex-col items-center gap-2 rounded-[18px] border-[1.5px] border-linea bg-papel p-4 text-lg font-extrabold transition-colors hover:border-ambar disabled:opacity-50'
  return (
    <div className="flex flex-col gap-3">
      <span className="text-base font-semibold">Elige cómo verificar tu identidad</span>
      {aviso && (
        <p role="alert" className="m-0 rounded-xl bg-rechazo-fondo px-3 py-2.5 text-base font-bold text-rechazo">
          {aviso}
        </p>
      )}
      <div className="flex gap-3">
        <button type="button" className={opcion} disabled={deshabilitado} onClick={() => setMetodo('rostro')}>
          <ScanFace aria-hidden className="size-12" strokeWidth={1.75} />
          Rostro
        </button>
        <button type="button" className={opcion} disabled={deshabilitado} onClick={() => setMetodo('huella')}>
          <Fingerprint aria-hidden className="size-12" strokeWidth={1.75} />
          Huella
        </button>
      </div>
    </div>
  )
}

function OtroMetodo({ alElegir }: { alElegir: () => void }) {
  return (
    <button type="button" onClick={alElegir} className="self-center text-base font-semibold underline underline-offset-4">
      Elegir otro método
    </button>
  )
}
