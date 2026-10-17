// Inicio: elegir con qué rol entrar. No hay cuentas de usuario.
import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useRol } from '@/contexto/Rol'
import { Icono, Marca, PantallaCelular } from '@/componentes/piezas'
import { BotonTema } from '@/componentes/BotonTema'

interface OpcionRol {
  a: string
  titulo: string
  detalle: string
  fondo: string
  icono: ReactNode
}

const OPCIONES: OpcionRol[] = [
  {
    a: '/entrar/entidad',
    titulo: 'Entidad',
    detalle: 'Sus programas y lo que se ha cobrado',
    fondo: 'bg-noche',
    icono: (
      <Icono className="size-[22px]" stroke="#F5F0E6">
        <path d="M3 21h18" />
        <path d="M5 21V10l7-5 7 5v11" />
        <path d="M9 21v-6h6v6" />
      </Icono>
    ),
  },
  {
    a: '/entrar/beneficiario',
    titulo: 'Beneficiaria',
    detalle: 'Sus subsidios por cobrar',
    fondo: 'bg-azul',
    icono: (
      <Icono className="size-[22px]" stroke="#FFFFFF">
        <rect x="6" y="2" width="12" height="20" rx="3" />
        <path d="M11 18h2" />
      </Icono>
    ),
  },
  {
    a: '/entrar/punto',
    titulo: 'Punto de retiro',
    detalle: 'Paga subsidios desde el celular',
    fondo: 'bg-ambar',
    icono: (
      <Icono className="size-[22px]" stroke="#13203A">
        <path d="M4 10h16l-1-5H5z" />
        <path d="M5 10v10h14V10" />
        <path d="M10 20v-5h4v5" />
      </Icono>
    ),
  },
]

export function ElegirRol() {
  const { elegirRol } = useRol()
  // Estar en el inicio es no tener rol: "Cambiar de rol" llega aquí desde cualquier pantalla
  useEffect(() => elegirRol(null), [elegirRol])

  return (
    <PantallaCelular>
      {/* Arriba, como en las demás pantallas; la marca y los roles quedan centrados en el resto */}
      <div className="flex justify-end">
        <BotonTema />
      </div>
      <div className="flex flex-1 flex-col justify-center gap-8 pb-10">
        <Marca tamano="inicio" />

        <nav aria-labelledby="como-entrar" className="flex flex-col gap-3">
          <h1 id="como-entrar" className="m-0 text-base font-semibold text-tinta-suave">
            ¿Cómo quieres entrar?
          </h1>
          {OPCIONES.map((o) => (
            <Link
              key={o.a}
              to={o.a}
              className="flex min-h-[76px] items-center gap-3.5 rounded-[18px] border-[1.5px] border-linea bg-papel px-4 py-3.5 text-foreground no-underline transition-colors hover:border-foreground hover:text-foreground"
            >
              <span className={`flex size-11 flex-none items-center justify-center rounded-xl ${o.fondo}`}>{o.icono}</span>
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-lg font-bold">{o.titulo}</span>
                <span className="text-[15px] text-tinta-suave">{o.detalle}</span>
              </span>
              <Icono className="size-5" stroke="var(--foreground)">
                <path d="M9 6l6 6-6 6" />
              </Icono>
            </Link>
          ))}
          <Link
            to="/entrar/punto"
            className="flex min-h-11 items-center justify-center gap-2 text-base font-semibold text-foreground"
          >
            <Icono className="size-[18px]" stroke="var(--foreground)">
              <rect x="3" y="4" width="18" height="12" rx="2" />
              <path d="M8 20h8M12 16v4" />
            </Icono>
            Punto de retiro en computador
          </Link>
        </nav>
      </div>
    </PantallaCelular>
  )
}
