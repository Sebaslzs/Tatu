// Piezas visuales compartidas: marcos de pantalla, marca, botones, mensajes e íconos.
import type { ReactNode, SVGProps } from 'react'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'
import { BotonTema } from '@/componentes/BotonTema'

const LOGO_CLARO = '/brand/tatu-logo-claro.svg'
const LOGO_OSCURO = '/brand/tatu-logo-oscuro.svg'

/** Columna de celular: 480 px centrada, con bordes laterales desde 560 px. */
export function PantallaCelular({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-background pt-[18px] pb-6 text-foreground',
        'px-[max(20px,env(safe-area-inset-left))] min-[560px]:border-x min-[560px]:border-linea',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Pantalla de computador: panel azul noche con la marca + columna del formulario. */
export function PantallaPartida({ titulo, texto, children }: { titulo: string; texto: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-wrap bg-background text-foreground">
      <aside className="flex flex-[1_1_420px] flex-col justify-between gap-10 bg-noche px-12 py-14 text-arena max-sm:px-6 max-sm:py-10">
        <div className="flex items-start justify-between gap-3">
          <Marca tono="oscuro" tamano="panel" />
          <BotonTema sobreBloque />
        </div>
        <div className="flex max-w-[460px] flex-col gap-4">
          <h2 className="ancho m-0 text-[38px] leading-[1.1] font-extrabold max-sm:text-[30px]">{titulo}</h2>
          <p className="m-0 text-lg leading-normal text-panel-texto">{texto}</p>
        </div>
      </aside>
      <div className="flex flex-[1.3_1_480px] items-center justify-center px-8 py-12 max-sm:px-5">
        <div className="flex w-full max-w-[480px] flex-col gap-5">{children}</div>
      </div>
    </div>
  )
}

const TAMANOS = {
  inicio: { logo: 'w-[124px]', texto: 'text-[50px] leading-none' },
  cabecera: { logo: 'w-10', texto: 'text-2xl' },
  panel: { logo: 'w-[52px]', texto: 'text-[30px]' },
} as const

/** El logo seg?n el fondo: en el modo oscuro, el claro se cambia por el oscuro. */
function LogoTatu({ tono, className }: { tono: 'claro' | 'oscuro'; className?: string }) {
  if (tono === 'oscuro') return <img src={LOGO_OSCURO} alt="" className={className} />
  return (
    <>
      <img src={LOGO_CLARO} alt="" className={cn(className, 'oscuro:hidden')} />
      <img src={LOGO_OSCURO} alt="" className={cn(className, 'hidden oscuro:block')} />
    </>
  )
}

/** Logo + "Tatú". Claro sobre arena, oscuro sobre el panel azul noche. */
export function Marca({ tono = 'claro', tamano = 'cabecera' }: { tono?: 'claro' | 'oscuro'; tamano?: keyof typeof TAMANOS }) {
  const t = TAMANOS[tamano]
  const logo = <LogoTatu tono={tono} className={cn('h-auto', t.logo)} />
  const nombre = <span className={cn('ancho font-extrabold', t.texto)}>Tatú</span>
  if (tamano === 'inicio') {
    return (
      <div className="flex flex-col items-center gap-2.5 text-center">
        {logo}
        {nombre}
      </div>
    )
  }
  return (
    <div className={cn('flex items-center', tamano === 'panel' ? 'gap-3' : 'gap-2.5')}>
      {logo}
      {nombre}
    </div>
  )
}

/** Cabecera de las pantallas de celular: la marca a la izquierda. */
export function CabeceraCelular() {
  return (
    <div className="flex items-center justify-between">
      <Marca />
      <BotonTema />
    </div>
  )
}

export function VolverARol({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn(
        'inline-flex min-h-11 items-center gap-1 self-start text-base font-semibold text-foreground no-underline',
        className,
      )}
    >
      <Icono className="size-[22px]">
        <path d="M15 6l-6 6 6 6" />
      </Icono>
      Cambiar de rol
    </Link>
  )
}

/** Botón principal azul de los formularios (56 px de alto). */
export function BotonEntrar({ children, className, disabled }: { children: ReactNode; className?: string; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className={cn(
        'flex min-h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-[14px] border-0 bg-azul font-sans text-lg font-bold text-white',
        'transition-colors hover:bg-[#2752c4] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-azul',
        className,
      )}
    >
      {children}
    </button>
  )
}

/** Mensaje de error de un formulario; no muestra nada si no hay error. */
export function MensajeError({ id, children }: { id: string; children: ReactNode }) {
  if (!children) return null
  return (
    <div
      id={id}
      role="alert"
      className="flex items-center gap-2.5 rounded-xl bg-error-fondo px-3 py-2.5 text-base font-bold text-error"
    >
      <Icono className="size-5" stroke="var(--color-error)">
        <path d="M12 3l10 18H2z" />
        <path d="M12 10v5" />
        <path d="M12 18h.01" />
      </Icono>
      {children}
    </div>
  )
}

/** Íconos de trazo sobre una cuadrícula de 24 px. */
export function Icono({ children, className, stroke = 'currentColor', strokeWidth = 2, ...resto }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn('shrink-0', className)}
      {...resto}
    >
      {children}
    </svg>
  )
}

export function IconoCandado({ stroke }: { stroke: string }) {
  return (
    <Icono className="size-[18px]" stroke={stroke}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </Icono>
  )
}
