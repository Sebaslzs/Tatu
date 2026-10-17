// El PIN de 4 dígitos en el punto (HU-11): el teclado del prototipo y las 4 casillas sobre el bloque
// ámbar. El PIN vive solo en el estado de la pantalla que lo usa: se envía una vez y se borra.
import { Delete } from 'lucide-react'
import { useEffect, type Dispatch, type SetStateAction } from 'react'
import { cn } from '@/lib/utils'

const LARGO_PIN = 4

/** Agrega un dígito sin pasar de 4. */
function agregarDigito(pin: string, d: string): string {
  return pin.length < LARGO_PIN ? pin + d : pin
}

/**
 * Teclado del prototipo (P2): 1 a 9, un hueco, 0 y borrar. También se digita con el teclado físico
 * (Escape borra todo). Usa actualizaciones funcionales: dos toques seguidos antes de volver a pintar
 * no pierden un dígito. `oculto`: en el computador (PD2) no se dibuja, solo escucha el teclado.
 */
export function TecladoPin({ onChange, deshabilitado = false, oculto = false }: { onChange: Dispatch<SetStateAction<string>>; deshabilitado?: boolean; oculto?: boolean }) {
  const agregar = (d: string) => !deshabilitado && onChange((p) => agregarDigito(p, d))
  const borrar = () => !deshabilitado && onChange((p) => p.slice(0, -1))
  const limpiar = () => !deshabilitado && onChange('')

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return
      if (/^\d$/.test(e.key)) agregar(e.key)
      else if (e.key === 'Backspace') borrar()
      else if (e.key === 'Escape') limpiar()
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  })

  if (oculto) return null

  const tecla = 'h-12 cursor-pointer rounded-xl border-[1.5px] border-linea bg-papel font-sans text-2xl font-bold text-foreground active:bg-nota disabled:cursor-not-allowed disabled:opacity-50'
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {'123456789'.split('').map((d) => (
        <button key={d} type="button" aria-label={`Dígito ${d}`} disabled={deshabilitado} onClick={() => agregar(d)} className={tecla}>
          {d}
        </button>
      ))}
      <span />
      <button type="button" aria-label="Dígito 0" disabled={deshabilitado} onClick={() => agregar('0')} className={tecla}>
        0
      </button>
      <button
        type="button"
        aria-label="Borrar un dígito"
        disabled={deshabilitado}
        onClick={borrar}
        className="flex h-12 cursor-pointer items-center justify-center rounded-xl border-0 bg-transparent text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Delete aria-hidden className="size-[26px]" strokeWidth={2} />
      </button>
    </div>
  )
}

/**
 * Las 4 casillas del PIN sobre el bloque ámbar, con su lectura para lector de pantalla («2 de 4
 * dígitos»). `grande`: las del computador (72 × 80). `error`: el borde rojo de «PIN incorrecto».
 */
export function PuntosPin({ largo, grande = false, error = false }: { largo: number; grande?: boolean; error?: boolean }) {
  return (
    <div role="img" aria-label={`${largo} de ${LARGO_PIN} dígitos`} className={cn('flex', grande ? 'gap-3.5' : 'justify-center gap-2.5')}>
      {Array.from({ length: LARGO_PIN }, (_, i) => (
        <span
          key={i}
          className={cn(
            'flex items-center justify-center bg-papel',
            grande ? 'h-20 w-[72px] rounded-[14px] border-[2.5px]' : 'h-[54px] w-[52px] rounded-xl border-2',
            error ? 'border-rechazo' : i < largo ? 'border-foreground' : grande ? 'border-control' : 'border-control',
          )}
        >
          {i < largo && <span className={cn('rounded-full bg-foreground', grande ? 'size-[18px]' : 'size-3.5')} />}
        </span>
      ))}
    </div>
  )
}
