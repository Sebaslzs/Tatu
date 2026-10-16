// Enlazar la cuenta donde la persona recibe sus cobros: una llave Bre-B del tipo que ella elige o
// una billetera Open Payments. Una llave de otro tipo que la cédula se confirma con el titular
// antes de enlazar; una billetera puede pedir aprobar el enlace en la propia billetera.
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { consultarLlave, enlazarCuenta, type Cuenta, type DatosCuenta, type LlaveConsultada, type Resumen, type TipoLlave } from '@/api/beneficiario'
import { mensajeDeError } from '@/api/client'
import { IconoCandado, MensajeError, PantallaCelular } from '@/componentes/piezas'
import { TatuCargando } from '@/componentes/tatu/TatuCargando'
import { useRol } from '@/contexto/Rol'
import { formatearMonto } from '@/lib/formato'
import { cn } from '@/lib/utils'
import { Aviso, Boton, BotonEnlace, Cabecera, ErrorCarga, FilasDatos, IconoEnlace } from './comunes'
import { pagoDe, useResumen } from './datos'

type Tipo = TipoLlave | 'billetera'

const TIPOS: { tipo: Tipo; nombre: string; etiqueta: string; teclado: 'numeric' | 'tel' | 'email' | 'text'; ayuda?: string }[] = [
  { tipo: 'cedula', nombre: 'Cédula', etiqueta: 'Tu cédula como llave', teclado: 'numeric', ayuda: 'Si tu banco la tiene registrada en Bre-B, queda lista de una vez.' },
  { tipo: 'celular', nombre: 'Celular', etiqueta: 'Tu celular', teclado: 'tel', ayuda: '10 números, empieza por 3.' },
  { tipo: 'correo', nombre: 'Correo', etiqueta: 'Tu correo', teclado: 'email' },
  { tipo: 'alfanumerica', nombre: '@Llave', etiqueta: 'Tu @llave', teclado: 'text', ayuda: 'Empieza por @.' },
  { tipo: 'billetera', nombre: 'Billetera', etiqueta: 'Dirección de tu billetera', teclado: 'text', ayuda: 'La encuentras en tu billetera, en «Recibir».' },
]

const RESULTADOS: Record<string, string> = {
  rechazada: 'No aprobaste el enlace en tu billetera. Puedes intentarlo de nuevo.',
  invalido: 'No pudimos confirmar el enlace con tu billetera. Intenta de nuevo.',
}

const soloDigitos = (s: string) => s.replace(/\D/g, '')

/** Revisión rápida antes de llamar a la API; la validación completa la hace el servidor. */
function revisar(tipo: Tipo, llave: string): string | null {
  const v = llave.trim()
  if (!v) return 'Escribe tu llave.'
  if (tipo === 'cedula' && !/^\d{6,10}$/.test(soloDigitos(v))) return 'La cédula son de 6 a 10 números.'
  if (tipo === 'celular' && !/^3\d{9}$/.test(soloDigitos(v))) return 'El celular son 10 números y empieza por 3.'
  if (tipo === 'correo' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Revisa el correo.'
  if (tipo === 'alfanumerica' && !/^@[a-zA-Z0-9._-]{2,30}$/.test(v)) return 'La @llave empieza por @ y lleva de 2 a 30 letras o números.'
  if (tipo === 'billetera' && !/^(\$|https:\/\/)\S+$/.test(v)) return 'La dirección empieza por $ o por https://.'
  return null
}

export function EnlazarCuenta() {
  const [parametros] = useSearchParams()
  const programaId = parametros.get('programa')
  const resultado = parametros.get('resultado')
  const { datos: r, error, cargando, recargar } = useResumen()
  const [cambiar, setCambiar] = useState(false)
  const [nueva, setNueva] = useState<Cuenta | null>(null)

  const cuenta = nueva ?? (r?.cuenta?.estado === 'Verificada' ? r.cuenta : null)
  const volver = programaId ? `/beneficiario/subsidios/${programaId}` : '/beneficiario'
  const lista = cuenta && !cambiar

  return (
    <PantallaCelular className="gap-4">
      <Cabecera
        volver={volver}
        etiquetaVolver={programaId ? 'Volver al subsidio' : 'Volver a mis subsidios'}
        titulo={lista ? 'Cuenta enlazada' : 'Enlaza tu cuenta'}
        subtitulo={lista ? 'Paso 2 de 2' : 'Paso 1 de 2'}
      />
      {cargando && <TatuCargando />}
      {!r && error !== null && <ErrorCarga error={error} reintentar={recargar} />}
      {r && lista && <CuentaLista cuenta={cuenta} resumen={r} programaId={programaId} conBilletera={resultado === 'verificada'} onCambiar={() => setCambiar(true)} />}
      {r && !lista && (
        <Formulario
          resumen={r}
          aviso={resultado ? RESULTADOS[resultado] : undefined}
          onEnlazada={(c) => {
            setNueva(c)
            setCambiar(false)
            recargar()
          }}
        />
      )}
    </PantallaCelular>
  )
}

function Formulario({ resumen, aviso, onEnlazada }: { resumen: Resumen; aviso?: string; onEnlazada: (c: Cuenta) => void }) {
  const { cedula } = useRol()
  const [tipo, setTipo] = useState<Tipo>('cedula')
  const [llave, setLlave] = useState(resumen.persona.cedula)
  const [pin, setPin] = useState('')
  const [confirmar, setConfirmar] = useState<LlaveConsultada | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(aviso ?? null)

  const definicion = TIPOS.find((t) => t.tipo === tipo) ?? TIPOS[0]
  const cedulaPropia = tipo === 'cedula' && soloDigitos(llave) === soloDigitos(resumen.persona.cedula)
  const pidePin = resumen.persona.tienePin && !cedulaPropia

  const elegirTipo = (t: Tipo) => {
    setTipo(t)
    setLlave(t === 'cedula' ? resumen.persona.cedula : '')
    setConfirmar(null)
    setError(null)
  }

  const datos = (): DatosCuenta => {
    const conPin = pidePin ? { pin } : {}
    if (tipo === 'billetera') return { billetera: llave.trim(), ...conPin }
    return { tipoLlave: tipo, llave: llave.trim(), ...conPin }
  }

  const enlazar = async () => {
    if (!cedula) return
    setEnviando(true)
    setError(null)
    try {
      const { redirect, cuenta } = await enlazarCuenta(cedula, datos())
      if (redirect) {
        window.location.assign(redirect)
        return
      }
      onEnlazada(cuenta)
    } catch (e) {
      setError(mensajeDeError(e))
      setConfirmar(null)
      setEnviando(false)
    }
  }

  const continuar = async (e: FormEvent) => {
    e.preventDefault()
    const problema = revisar(tipo, llave) ?? (pidePin && !/^\d{4}$/.test(pin) ? 'El PIN son 4 números.' : null)
    if (problema) return setError(problema)
    // Solo una llave que no es la cédula propia se confirma con el titular antes de enlazarla
    if (tipo === 'billetera' || cedulaPropia) return void enlazar()
    setEnviando(true)
    setError(null)
    try {
      setConfirmar(await consultarLlave(tipo, llave.trim()))
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setEnviando(false)
    }
  }

  if (confirmar) {
    return (
      <>
        <h1 className="ancho m-0 mt-2 text-[28px] leading-[1.15] font-extrabold">¿Esta llave es tuya?</h1>
        <FilasDatos
          filas={[
            ['Llave', confirmar.llave],
            ['A nombre de', confirmar.titular],
          ]}
        />
        <Aviso>Solo puedes enlazar una llave que esté a tu nombre. Si no eres tú, cámbiala.</Aviso>
        <MensajeError id="enlace-error">{error}</MensajeError>
        <div className="mt-auto flex flex-col gap-2.5">
          <Boton onClick={() => void enlazar()} disabled={enviando}>
            {enviando ? 'Enlazando…' : 'Sí, enlazar'}
          </Boton>
          <Boton variante="contorno" onClick={() => setConfirmar(null)} disabled={enviando}>
            No, cambiar la llave
          </Boton>
        </div>
      </>
    )
  }

  return (
    <form onSubmit={continuar} noValidate className="flex flex-1 flex-col gap-4">
      <p className="m-0 text-[17px] leading-[1.45]">Así nadie más puede enlazar una cuenta a tu cédula.</p>

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 p-0 text-base font-bold">¿Dónde quieres recibir?</legend>
        <div className="flex flex-wrap gap-2">
          {TIPOS.map((t) => (
            <label
              key={t.tipo}
              className={cn(
                'flex min-h-11 cursor-pointer items-center rounded-full border-[1.5px] px-4 text-base font-semibold has-focus-visible:outline-3 has-focus-visible:outline-azul',
                tipo === t.tipo ? 'border-noche bg-noche text-arena' : 'border-linea bg-papel text-noche hover:border-noche',
              )}
            >
              <input type="radio" name="tipo" value={t.tipo} checked={tipo === t.tipo} onChange={() => elegirTipo(t.tipo)} className="sr-only" />
              {t.nombre}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="llave" className="text-base font-bold">
          {definicion.etiqueta}
        </label>
        <input
          id="llave"
          inputMode={definicion.teclado}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={llave}
          onChange={(e) => {
            setLlave(e.target.value)
            setError(null)
          }}
          className="h-14 w-full rounded-xl border-2 border-borde-campo bg-papel px-3.5 font-sans text-lg text-noche"
        />
        {definicion.ayuda && <span className="text-sm text-tinta-suave">{definicion.ayuda}</span>}
      </div>

      {pidePin && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pin" className="text-base font-bold">
            Tu PIN
          </label>
          <input
            id="pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={pin}
            onChange={(e) => {
              setPin(soloDigitos(e.target.value))
              setError(null)
            }}
            className="h-14 w-full rounded-xl border-2 border-borde-campo bg-papel px-3.5 font-sans text-lg tracking-[0.3em] text-noche"
          />
          <span className="text-sm text-tinta-suave">Es el que te entregó la entidad con tu subsidio.</span>
        </div>
      )}

      <div className="flex items-start gap-2.5 text-[15px] leading-[1.4] text-tinta-suave">
        <IconoCandado stroke="#4A5468" />
        <span>
          Solo guardamos a dónde llega tu dinero, nunca tus claves.
          {tipo === 'billetera' && ' En el paso 2 apruebas el enlace en tu billetera.'}
        </span>
      </div>

      <MensajeError id="enlace-error">{error}</MensajeError>
      <Boton tipo="submit" disabled={enviando} className="mt-auto">
        {enviando ? 'Revisando…' : tipo === 'billetera' || cedulaPropia ? 'Enlazar' : 'Continuar'}
      </Boton>
    </form>
  )
}

function CuentaLista({
  cuenta,
  resumen,
  programaId,
  conBilletera,
  onCambiar,
}: {
  cuenta: Cuenta
  resumen: Resumen
  programaId: string | null
  conBilletera: boolean
  onCambiar: () => void
}) {
  const pago = programaId ? pagoDe(resumen, programaId) : undefined
  return (
    <>
      <div className="mt-[18px] flex flex-col items-start gap-3.5">
        <span className="flex size-16 items-center justify-center rounded-full bg-azul">
          <IconoEnlace color="#FFFFFF" className="size-8" />
        </span>
        <h1 className="ancho m-0 text-[30px] leading-[1.15] font-extrabold">Tu cuenta está lista para recibir pagos</h1>
        <p className="m-0 text-[17px] leading-[1.45]">
          {conBilletera ? 'Aprobaste el enlace en tu billetera. ' : ''}Desde ahora cobras con un toque.
        </p>
      </div>
      <FilasDatos
        filas={[
          [cuenta.llave ? 'Llave Bre-B' : 'Billetera', cuenta.llave ?? cuenta.billeteraCorta],
          ['Estado', 'Verificada'],
        ]}
      />
      <div className="mt-auto flex flex-col gap-1">
        {pago && pago.programa.estado === 'Activo' && (
          <BotonEnlace a={`/beneficiario/cobrar/${pago.programa.id}`}>Cobrar {formatearMonto(pago.monto)} ahora</BotonEnlace>
        )}
        <BotonEnlace a="/beneficiario" variante={pago ? 'contorno' : 'primario'}>
          Ir a mis subsidios
        </BotonEnlace>
        <button
          type="button"
          onClick={onCambiar}
          className="mt-1 min-h-11 cursor-pointer border-0 bg-transparent font-sans text-[17px] font-semibold text-noche underline underline-offset-[3px]"
        >
          Enlazar otra cuenta
        </button>
      </div>
    </>
  )
}
