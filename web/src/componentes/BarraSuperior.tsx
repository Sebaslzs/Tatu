// Barra Noche de las pantallas con marco de plataforma (entidad, punto en el computador, beneficiaria
// en el computador): la marca, dónde se está, las secciones, el rol, el modo oscuro y «Cambiar rol».
// En pantallas angostas las secciones bajan a su propia fila, con scroll si no caben.
import { Link, NavLink, useNavigate } from 'react-router'
import { BotonTema } from '@/componentes/BotonTema'
import { cn } from '@/lib/utils'

export interface Seccion {
  a: string
  texto: string
  /** Solo activa en esa ruta exacta (no en sus subrutas). */
  fin?: boolean
}

export function BarraSuperior({
  inicio,
  etiquetaInicio,
  contexto,
  secciones,
  etiquetaSecciones,
  rol,
  ancho = 'max-w-[1200px]',
}: {
  /** A dónde lleva la marca. */
  inicio: string
  etiquetaInicio: string
  /** El nombre de la entidad o del punto, junto a la marca. */
  contexto?: string | null
  secciones: Seccion[]
  etiquetaSecciones: string
  /** «Entidad», «Punto», «Beneficiaria». */
  rol: string
  /** Ancho máximo del contenido, igual al del marco. */
  ancho?: string
}) {
  const navegar = useNavigate()
  return (
    <header className="bloque">
      <div className={cn('mx-auto flex flex-wrap items-center gap-x-5 gap-y-0 px-4 py-2 sm:px-6 pc:px-8', ancho)}>
        <Link to={inicio} aria-label={etiquetaInicio} className="flex min-h-11 items-center gap-2.5 text-bloque-texto no-underline hover:text-bloque-texto">
          <img src="/brand/tatu-logo-oscuro.svg" alt="" className="size-9 rounded-lg" />
          <span className="ancho text-2xl font-extrabold">Tatú</span>
        </Link>
        {contexto && (
          <span className="hidden max-w-[260px] min-w-0 truncate text-noche-tenue sm:inline">
            <span aria-hidden className="mr-3">
              /
            </span>
            {contexto}
          </span>
        )}
        <nav aria-label={etiquetaSecciones} className="flex gap-5 overflow-x-auto max-md:order-last max-md:w-full max-md:border-t max-md:border-noche-suave">
          {secciones.map((s) => (
            <NavLink
              key={s.a}
              to={s.a}
              end={s.fin}
              className={({ isActive }) =>
                cn(
                  'inline-flex min-h-11 flex-none items-center border-b-[3px] px-0.5 text-base whitespace-nowrap text-bloque-texto no-underline hover:text-bloque-texto',
                  isActive ? 'border-ambar font-bold' : 'border-transparent font-medium',
                )
              }
            >
              {s.texto}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden rounded-full border border-ambar px-3 py-1 text-sm font-bold whitespace-nowrap text-ambar sm:inline-flex">{rol}</span>
          <BotonTema sobreBloque />
          {/* El rol se borra al llegar a "/" (ElegirRol) */}
          <button
            type="button"
            onClick={() => navegar('/')}
            className="inline-flex min-h-11 cursor-pointer items-center border-0 bg-transparent font-sans text-[15px] whitespace-nowrap text-bloque-texto underline hover:text-ambar"
          >
            Cambiar rol
          </button>
        </div>
      </div>
    </header>
  )
}
