// Cerrar el programa (HU-17, wireframe 06): doble confirmación, el botón solo se habilita al
// escribir CERRAR. El tablero queda de fondo.
import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { http, mensajeDeError } from '@/api/http'
import { Boton, Campo, Cargando, ErrorCarga, MensajeError } from '@/componentes/Comun'
import { MarcoEntidad } from '@/componentes/MarcoEntidad'
import { textoMonto } from '@/lib/montos'
import { plural } from '@/lib/textos'
import { useTablero } from './useTablero'

const PALABRA = 'CERRAR'

export default function CerrarPrograma() {
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const consulta = useTablero(id)
  const d = consulta.datos
  const t = d?.tablero ?? null
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const volver = () => navegar(`/entidad/programas/${id}`)

  // Escape cierra el diálogo, como en un AlertDialog
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navegar(`/entidad/programas/${id}`)
    }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [id, navegar])

  if (d && d.programa.estado !== 'Activo' && d.programa.estado !== 'Pausado') {
    return <Navigate to={`/entidad/programas/${id}`} replace />
  }

  const cerrar = async () => {
    setEnviando(true)
    setError(null)
    try {
      await http.post(`/programas/${id}/cerrar`, { confirmacion: PALABRA })
      navegar(`/entidad/programas/${id}`, { replace: true })
    } catch (e) {
      setError(mensajeDeError(e))
      await consulta.recargar()
    } finally {
      setEnviando(false)
    }
  }

  const hayPagando = (t?.cobrosPagando ?? 0) > 0
  const confirmado = texto.trim().toUpperCase() === PALABRA

  return (
    <MarcoEntidad entidadId={d?.programa.entidadId}>
      <div aria-hidden className="flex flex-col gap-6">
        <div className="h-9 w-64 rounded-md bg-nota" />
        <div className="flex flex-wrap gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[130px] flex-[1_1_260px] rounded-xl border border-linea bg-papel" />
          ))}
        </div>
        <div className="h-3.5 rounded-full bg-nota" />
        <div className="h-[300px] rounded-xl border border-linea bg-papel" />
      </div>

      {consulta.error && !d && <ErrorCarga mensaje={consulta.error} reintentar={() => void consulta.recargar()} />}
      {!d && !consulta.error && <Cargando />}

      {d && (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-auto bg-noche/60 px-4 py-10 sm:items-center" onClick={volver}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="titulo-cierre"
            aria-describedby="texto-cierre"
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-[560px] flex-col gap-[18px] rounded-[14px] bg-papel p-6 text-foreground shadow-[0_24px_60px_rgba(10,16,30,0.35)] sm:p-7"
          >
            <div className="flex flex-col gap-2">
              <h2 id="titulo-cierre" className="titular m-0 text-[28px]">
                ¿Cerrar el programa?
              </h2>
              <p id="texto-cierre" className="m-0 text-base text-tinta-suave">
                Revocamos el permiso en tu banco y nadie podrá volver a cobrar. Esto no se puede deshacer.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="flex flex-[1_1_200px] flex-col gap-0.5 rounded-xl bg-nota px-4 py-3.5">
                <span className="text-sm text-tinta-suave">Cobrado</span>
                <span className="cifra text-[26px]">{textoMonto(t?.cobrado)}</span>
              </div>
              <div className="bloque flex flex-[1_1_200px] flex-col gap-0.5 rounded-xl px-4 py-3.5">
                <span className="text-sm font-bold">Se queda en tu cuenta</span>
                <span className="cifra text-[26px] text-ambar">{textoMonto(t?.noHaSalido)}</span>
              </div>
            </div>
            {t && (
              <p className="m-0 text-[15px] text-tinta-suave">
                {t.sinCobrar === null
                  ? 'No pudimos consultar cuántas cédulas faltan. '
                  : t.sinCobrar.cedulas > 0
                    ? `${plural(t.sinCobrar.cedulas, 'cédula')} todavía no ${t.sinCobrar.cedulas === 1 ? 'ha' : 'han'} cobrado. `
                    : 'Todas las cédulas ya cobraron. '}
                Después del cierre, cualquier intento se rechaza.
              </p>
            )}

            {hayPagando && (
              <p role="alert" className="m-0 rounded-xl border-2 border-pagando bg-pagando-fondo px-4 py-3 font-bold text-pagando">
                Hay {plural(t?.cobrosPagando ?? 0, 'cobro')} pagándose. Espera a que terminen para cerrar.
              </p>
            )}

            <Campo
              id="confirmar-cierre"
              etiqueta={`Escribe ${PALABRA} para confirmar`}
              mono
              autoFocus
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
            <MensajeError>{error}</MensajeError>

            <div className="flex flex-wrap justify-end gap-3">
              <Boton variante="contorno" onClick={volver}>
                Cancelar
              </Boton>
              <Boton variante="peligro" onClick={() => void cerrar()} disabled={!confirmado || hayPagando || enviando}>
                Cerrar programa
              </Boton>
            </div>
          </div>
        </div>
      )}
    </MarcoEntidad>
  )
}
