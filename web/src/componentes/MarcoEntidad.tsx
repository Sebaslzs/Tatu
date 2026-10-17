// Marco de la entidad: barra Noche con la marca (BarraSuperior) y contenido de hasta 1200 px. En el
// celular el mismo marco reduce márgenes y espacios; las tablas largas se apilan como tarjetas.
import type { ReactNode } from 'react'
import { useNombreEntidad } from '@/api/entidades'
import { BarraSuperior } from '@/componentes/BarraSuperior'

const SECCIONES = [{ a: '/entidad', texto: 'Programas' }]

export function MarcoEntidad({ entidadId, children }: { entidadId?: string; children: ReactNode }) {
  const nombre = useNombreEntidad(entidadId)

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      {/* El logo vuelve a elegir rol: el rol se borra al llegar a "/" (ElegirRol) */}
      <BarraSuperior inicio="/" etiquetaInicio="Tatú, volver a elegir rol" contexto={nombre} secciones={SECCIONES} etiquetaSecciones="Secciones de la entidad" rol="Entidad" />
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-4 pt-6 pb-12 sm:gap-6 sm:px-6 sm:pt-8 pc:px-8">{children}</main>
    </div>
  )
}
