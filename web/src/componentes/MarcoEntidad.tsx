// Marco de la entidad en escritorio: barra Noche con la marca y contenido de hasta 1200 px.
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { useNombreEntidad } from '@/api/entidades'
import { BotonTema } from '@/componentes/BotonTema'

export function MarcoEntidad({ entidadId, children }: { entidadId?: string; children: ReactNode }) {
  const nombre = useNombreEntidad(entidadId)
  const navegar = useNavigate()

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="border-b border-bloque bg-bloque text-bloque-texto">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-3 px-4 py-2 sm:px-6">
          <Link to="/entidad" className="flex min-h-11 items-center gap-2.5 text-bloque-texto no-underline hover:text-bloque-texto" aria-label="Tatú, tus programas">
            <img src="/brand/tatu-logo-oscuro.svg" alt="" className="size-9 rounded-lg" />
            <span className="ancho text-2xl font-extrabold">Tatú</span>
          </Link>
          {nombre && (
            <>
              <span aria-hidden className="text-noche-tenue">
                /
              </span>
              <span className="text-noche-tenue">{nombre}</span>
            </>
          )}
          <nav aria-label="Secciones de la entidad" className="ml-3 flex gap-5">
            <Link to="/entidad" className="inline-flex min-h-11 items-center border-b-[3px] border-ambar px-0.5 font-bold text-bloque-texto no-underline hover:text-bloque-texto">
              Programas
            </Link>
          </nav>
          <span className="ml-auto rounded-full border border-ambar px-3 py-1 text-sm font-bold whitespace-nowrap text-ambar">Entidad</span>
          {/* El rol se borra al llegar a "/" (ElegirRol) */}
          <BotonTema sobreBloque />
          <button
            type="button"
            onClick={() => navegar('/')}
            className="inline-flex min-h-11 cursor-pointer items-center border-0 bg-transparent font-sans text-[15px] text-bloque-texto underline hover:text-ambar"
          >
            Cambiar rol
          </button>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 pt-8 pb-12 sm:px-6">{children}</main>
    </div>
  )
}
