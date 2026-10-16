// Acceso de la entidad con su NIT (prototipo "LD1"). Entrar no mueve dinero.
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useRol } from '@/contexto/Rol'
import { BotonEntrar, IconoCandado, MensajeError, PantallaPartida, VolverARol } from './piezas'

/** 8 a 10 dígitos, guion y dígito de verificación. Se ignoran espacios y puntos. */
const nitValido = (nit: string) => /^\d{8,10}-\d$/.test(nit.replace(/[\s.]/g, ''))

export function EntrarEntidad() {
  const [nit, setNit] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { elegirRol } = useRol()
  const navegar = useNavigate()

  const entrar = (e: FormEvent) => {
    e.preventDefault()
    if (!nit.trim()) return setError('Escribe el NIT de tu entidad.')
    if (!nitValido(nit)) return setError('Revisa el NIT: son 8 a 10 números, un guion y el dígito.')
    elegirRol('entidad')
    navegar('/entidad')
  }

  return (
    <PantallaPartida
      titulo="La plata sale cuando alguien cobra"
      texto="Autoriza tus programas una vez en tu banco y sigue en tiempo real lo que se cobra y lo que nunca salió de tu cuenta."
    >
      <VolverARol />
      <h1 className="ancho m-0 text-[34px] leading-[1.15] font-extrabold max-sm:text-[28px]">Entra como entidad</h1>
      <p className="m-0 text-[17px] leading-[1.45]">Escribe el NIT de tu entidad para ver tus programas.</p>

      <form onSubmit={entrar} noValidate className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label htmlFor="nit" className="text-[17px] font-bold">
            NIT de la entidad
          </label>
          <input
            id="nit"
            inputMode="numeric"
            autoComplete="off"
            value={nit}
            onChange={(e) => {
              setNit(e.target.value)
              setError(null)
            }}
            aria-invalid={error !== null}
            aria-describedby={error ? 'nit-error' : 'nit-ayuda'}
            className="h-[60px] w-full rounded-[14px] border-2 border-noche bg-papel px-4 font-sans text-2xl font-bold tracking-[0.03em] text-noche"
          />
          <span id="nit-ayuda" className="text-[15px] text-tinta-suave">
            Con el dígito de verificación, sin puntos.
          </span>
        </div>
        {error && <MensajeError id="nit-error">{error}</MensajeError>}
        <BotonEntrar>Entrar</BotonEntrar>
      </form>

      <div className="flex items-start gap-2.5 rounded-[14px] bg-nota px-4 py-3.5 text-[15px] leading-[1.45]">
        <IconoCandado stroke="#13203A" />
        <span>Entrar no mueve dinero. Cada programa se autoriza aparte, en tu banco.</span>
      </div>
    </PantallaPartida>
  )
}
