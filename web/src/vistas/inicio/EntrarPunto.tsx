// Acceso del punto de retiro eligiendo su tienda (prototipo "L2" en celular y "LD2" en computador).
import { useCallback, useEffect, useId, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { listarPuntos, type PuntoRegistrado } from '@/api/client'
import { useRol } from '@/contexto/Rol'
import { cn } from '@/lib/utils'
import { BotonEntrar, CabeceraCelular, Icono, PantallaCelular, PantallaPartida, VolverARol } from './piezas'

// Punto elegido al entrar: solo su id, para que la caja sepa desde dónde se atiende.
const CLAVE_PUNTO = 'tatu.punto'

type Carga = { estado: 'cargando' } | { estado: 'error' } | { estado: 'listo'; puntos: PuntoRegistrado[] }

// El prototipo cambia a la versión de computador desde 960 px de ancho.
const COMPUTADOR = '(min-width: 960px)'
const suscribir = (aviso: () => void) => {
  const mq = window.matchMedia(COMPUTADOR)
  mq.addEventListener('change', aviso)
  return () => mq.removeEventListener('change', aviso)
}
const useEnComputador = () => useSyncExternalStore(suscribir, () => window.matchMedia(COMPUTADOR).matches)

const sinTildes = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export function EntrarPunto() {
  const computador = useEnComputador()
  const [busqueda, setBusqueda] = useState('')
  const [elegido, setElegido] = useState<string | null>(null)
  const [carga, setCarga] = useState<Carga>({ estado: 'cargando' })
  const { elegirRol } = useRol()
  const navegar = useNavigate()
  const nombreGrupo = useId()

  const pedirPuntos = useCallback(() => {
    listarPuntos()
      .then((puntos) => setCarga({ estado: 'listo', puntos }))
      .catch(() => setCarga({ estado: 'error' }))
  }, [])
  useEffect(pedirPuntos, [pedirPuntos])
  const reintentar = () => {
    setCarga({ estado: 'cargando' })
    pedirPuntos()
  }

  const puntos = carga.estado === 'listo' ? carga.puntos : []
  const filtro = sinTildes(busqueda.trim())
  const visibles = puntos.filter((p) => sinTildes(`${p.nombre} ${p.direccion}`).includes(filtro))
  const punto = visibles.find((p) => p.id === elegido)

  const entrar = (e: FormEvent) => {
    e.preventDefault()
    if (!punto) return
    try {
      sessionStorage.setItem(CLAVE_PUNTO, punto.id)
    } catch {
      // Sin almacenamiento la caja vuelve a pedir el punto; no bloquea la entrada
    }
    elegirRol('punto')
    navegar('/punto')
  }

  const titulo = <h1 className={cn('ancho m-0 leading-[1.15] font-extrabold', computador ? 'text-[34px]' : 'text-[30px]')}>¿Desde qué punto atiendes?</h1>
  const texto = <p className="m-0 text-[17px] leading-[1.45]">Elige tu tienda para ver tu caja y empezar a pagar.</p>

  const formulario = (
    <form onSubmit={entrar} className={cn('flex flex-1 flex-col', computador ? 'gap-5' : 'gap-4')}>
      <div className="relative">
        <span className="absolute top-1/2 left-3.5 flex -translate-y-1/2">
          <Icono className="size-5" stroke="#4A5468">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4-4" />
          </Icono>
        </span>
        <input
          type="search"
          aria-label="Buscar punto de retiro"
          placeholder="Buscar por nombre o dirección"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="h-[52px] w-full rounded-xl border-[1.5px] border-borde-campo bg-papel pr-3.5 pl-11 font-sans text-[17px] text-noche placeholder:text-tinta-suave"
        />
      </div>

      <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
        <legend className="mb-2 p-0 text-base font-bold">Puntos de retiro registrados</legend>
        {visibles.map((p) => {
          const activo = p.id === elegido
          return (
            <label
              key={p.id}
              className={cn(
                'flex cursor-pointer items-center gap-3.5 bg-papel py-3',
                computador ? 'min-h-[68px] rounded-[14px] px-4' : 'min-h-[72px] rounded-2xl px-3.5',
                activo ? 'border-[2.5px] border-azul' : 'border-[1.5px] border-linea hover:border-noche',
              )}
            >
              <input
                type="radio"
                name={nombreGrupo}
                value={p.id}
                checked={activo}
                onChange={() => setElegido(p.id)}
                className="size-[22px] flex-none accent-azul"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-[17px] font-bold">{p.nombre}</span>
                <span className="text-[15px] text-tinta-suave">{p.direccion}</span>
              </span>
            </label>
          )
        })}
        {carga.estado === 'cargando' && <AvisoLista>Cargando los puntos…</AvisoLista>}
        {carga.estado === 'error' && (
          <AvisoLista>
            No pudimos traer los puntos.{' '}
            <button type="button" onClick={reintentar} className="cursor-pointer border-0 bg-transparent p-0 font-sans text-[15px] font-bold text-azul underline">
              Intentar de nuevo
            </button>
          </AvisoLista>
        )}
        {carga.estado === 'listo' && puntos.length === 0 && <AvisoLista>Todavía no hay puntos registrados.</AvisoLista>}
        {puntos.length > 0 && visibles.length === 0 && <AvisoLista>No hay puntos con “{busqueda.trim()}”.</AvisoLista>}
      </fieldset>

      <BotonEntrar disabled={!punto} className={computador ? undefined : 'mt-auto'}>
        {punto ? `Entrar como ${punto.nombre}` : 'Elige un punto'}
      </BotonEntrar>
    </form>
  )

  if (computador) {
    return (
      <PantallaPartida
        titulo="Paga subsidios sin adelantar tu caja"
        texto="Entregas el efectivo solo cuando la pantalla dice Pagado, y el reembolso llega a tu billetera en segundos."
      >
        <VolverARol />
        {titulo}
        {texto}
        {formulario}
      </PantallaPartida>
    )
  }

  return (
    <PantallaCelular className="gap-4">
      <CabeceraCelular />
      <VolverARol className="-ml-2 px-2" />
      <div className="flex flex-col gap-2">
        {titulo}
        {texto}
      </div>
      {formulario}
    </PantallaCelular>
  )
}

function AvisoLista({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="m-0 rounded-2xl border-[1.5px] border-dashed border-linea px-4 py-5 text-center text-[15px] text-tinta-suave">
      {children}
    </p>
  )
}
