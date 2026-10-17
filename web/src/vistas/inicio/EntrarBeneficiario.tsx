// Acceso de la beneficiaria con su cédula. Con la cédula sola nadie cobra.
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { obtenerResumen } from '@/api/beneficiario'
import { codigoDeError, mensajeDeError } from '@/api/client'
import { useRol } from '@/contexto/Rol'
import { BotonEntrar, CabeceraCelular, Icono, IconoCandado, MensajeError, PantallaCelular, PantallaPartida, VolverARol } from '@/componentes/piezas'
import { useEnComputador } from '@/lib/useEnComputador'

/** Solo números (se aceptan espacios al escribir), entre 6 y 10 dígitos. */
const cedulaValida = (cc: string) => /^\d{6,10}$/.test(cc.replace(/\s/g, ''))

export function EntrarBeneficiario() {
  const computador = useEnComputador()
  const [cedula, setCedula] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [consultando, setConsultando] = useState(false)
  const { entrarComoBeneficiario } = useRol()
  const navegar = useNavigate()

  // La cédula debe estar registrada: se consulta su resumen antes de entrar
  const entrar = async (e: FormEvent) => {
    e.preventDefault()
    if (!cedula.trim()) return setError('Escribe tu número de cédula.')
    if (!cedulaValida(cedula)) return setError('Revisa la cédula: solo números, de 6 a 10 dígitos.')
    const limpia = cedula.replace(/\s/g, '')
    setConsultando(true)
    try {
      await obtenerResumen(limpia)
      entrarComoBeneficiario(limpia)
      navegar('/beneficiario')
    } catch (err) {
      setError(codigoDeError(err) === 'PersonaNoEncontrada' ? 'Esa cédula no está registrada en ningún programa.' : mensajeDeError(err))
      setConsultando(false)
    }
  }

  const encabezado = (
    <div className="mt-2 flex flex-col gap-2 pc:mt-0">
      <span className="flex size-[52px] items-center justify-center rounded-[14px] bg-azul">
        <Icono className="size-[26px]" stroke="#FFFFFF">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="9" cy="12" r="2.5" />
          <path d="M14 10h4M14 14h3" />
        </Icono>
      </span>
      <h1 className="ancho m-0 mt-2 text-[30px] leading-[1.15] font-extrabold pc:text-[34px]">Consulta tus subsidios</h1>
      <p className="m-0 text-[17px] leading-[1.45]">Escribe tu número de cédula para ver lo que tienes por cobrar.</p>
    </div>
  )

  const formulario = (
      <form onSubmit={(e) => void entrar(e)} noValidate className="flex flex-col gap-4">
        <div className="mt-2 flex flex-col gap-2">
          <label htmlFor="cc" className="text-[17px] font-bold">
            Número de cédula
          </label>
          <input
            id="cc"
            inputMode="numeric"
            autoComplete="off"
            value={cedula}
            onChange={(e) => {
              setCedula(e.target.value)
              setError(null)
            }}
            aria-invalid={error !== null}
            aria-describedby={error ? 'cc-error' : 'cc-ayuda'}
            className="h-16 w-full rounded-[14px] border-2 border-foreground bg-papel px-4 font-sans text-[26px] font-bold tracking-[0.04em] text-foreground"
          />
          <span id="cc-ayuda" className="text-[15px] text-tinta-suave">
            Solo números, sin puntos.
          </span>
        </div>
        {error && <MensajeError id="cc-error">{error}</MensajeError>}
        <BotonEntrar disabled={consultando}>{consultando ? 'Consultando…' : 'Entrar'}</BotonEntrar>
      </form>
  )

  const nota = (
    <div className="mt-auto flex items-start gap-2.5 text-[15px] leading-[1.45] text-tinta-suave pc:mt-0">
      <IconoCandado stroke="var(--color-tinta-suave)" />
      <span>
        Para cobrar siempre te pediremos algo más: tu cuenta verificada o tu PIN en el punto. Con la cédula sola nadie
        puede cobrar tu subsidio.
      </span>
    </div>
  )

  // En el computador, el panel de la marca al lado del formulario, como la entidad y el punto. El
  // estado vive aquí arriba: al pasar de un tamaño a otro la cédula digitada no se pierde.
  if (computador) {
    return (
      <PantallaPartida titulo="Tu subsidio, cuando lo necesitas" texto="Mira lo que tienes por cobrar y cóbralo a tu cuenta o en un punto de retiro cerca de ti.">
        <VolverARol />
        {encabezado}
        {formulario}
        {nota}
      </PantallaPartida>
    )
  }

  return (
    <PantallaCelular className="gap-4">
      <CabeceraCelular />
      <VolverARol className="-ml-2 px-2" />
      {encabezado}
      {formulario}
      {nota}
    </PantallaCelular>
  )
}
