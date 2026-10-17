// Inicio del beneficiario: lo que tiene por cobrar, el estado de su cuenta y lo que ya cobró.
import { Link } from 'react-router'
import type { Cobro, Cuenta, PagoPendiente } from '@/api/beneficiario'
import { Icono, Marca } from '@/componentes/piezas'
import { TatuCargando } from '@/componentes/tatu/TatuCargando'
import { formatearFechaHora, formatearMonto } from '@/lib/formato'
import { cn } from '@/lib/utils'
import { BotonVolver, ErrorCarga, PantallaBeneficiario, Vence } from './comunes'
import { nombreTipo, useResumen } from './datos'
import { BotonTema } from '@/componentes/BotonTema'

export function MisSubsidios() {
  const { datos: r, error, cargando, recargar } = useResumen()
  const cobrados = r?.historial.filter((c) => c.estado === 'Pagado') ?? []

  return (
    <PantallaBeneficiario nombre={r?.persona.nombre} className="gap-3.5">
      {/* En el computador la marca y el modo oscuro están en la barra */}
      <div className="flex items-center gap-2.5 pc:hidden">
        <BotonVolver a="/" etiqueta="Volver a elegir rol" />
        <Marca />
        <BotonTema className="ml-auto" />
      </div>

      {cargando && <TatuCargando texto="Buscando tus subsidios…" />}
      {!r && error !== null && <ErrorCarga error={error} reintentar={recargar} />}

      {r && (
        // Celular: una sola columna (las dos columnas son `contents`). Computador: los subsidios a la
        // izquierda; la cuenta y lo ya cobrado en la columna de la derecha.
        <div className="flex flex-1 flex-col gap-3.5 pc:grid pc:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] pc:items-start pc:gap-x-8 pc:gap-y-6">
          <div className="flex flex-col gap-3.5 max-pc:contents pc:gap-5">
            <div className="-mt-1 text-[15px] text-tinta-suave pc:mt-0 pc:text-base">Hola, {r.persona.nombre}</div>
            <h1 className="m-0 flex flex-col gap-0.5 font-normal">
              <span className="text-[17px]">{r.pagos.length > 0 ? 'Tienes por cobrar' : 'Por ahora'}</span>
              <span className="ancho text-[30px] font-extrabold pc:text-[38px]">{tituloPendientes(r.pagos.length)}</span>
            </h1>

            {r.pagos.length > 0 && (
              <div className="flex flex-col gap-3.5 md:grid md:grid-cols-2 md:gap-4">
                {r.pagos.map((p, i) => (
                  <TarjetaPago key={p.programa.id} pago={p} destacada={i === 0} ancha={i === 0 && r.pagos.length % 2 === 1} />
                ))}
              </div>
            )}
            {r.pagos.length === 0 && (
              <p className="m-0 rounded-2xl border-[1.5px] border-dashed border-linea px-4 py-5 text-center text-[15px] text-tinta-suave">
                Cuando una entidad te asigne un subsidio, aparecerá aquí.
              </p>
            )}
          </div>

          <aside aria-label="Tu cuenta y lo que ya cobraste" className="flex flex-col gap-5 max-pc:contents">
            <FilaCuenta cuenta={r.cuenta} />

            <section className="mt-auto flex flex-col pt-2 pc:mt-0 pc:rounded-[20px] pc:border-[1.5px] pc:border-linea pc:bg-papel pc:p-5">
              <h2 className="m-0 text-[17px] font-extrabold">Ya cobrados</h2>
            {cobrados.length === 0 ? (
              <div className="mt-2 rounded-[14px] border-[1.5px] border-dashed border-linea p-3.5 text-center text-[15px] text-tinta-suave">
                Aquí verás los subsidios que cobres, con su referencia.
              </div>
            ) : (
              <ul className="m-0 mt-2 flex list-none flex-col p-0">
                {cobrados.map((c) => (
                  <FilaCobrado key={c.id} cobro={c} />
                ))}
              </ul>
            )}
            </section>
          </aside>
        </div>
      )}
    </PantallaBeneficiario>
  )
}

function tituloPendientes(n: number): string {
  if (n === 0) return 'Nada por cobrar'
  return n === 1 ? '1 subsidio' : `${n} subsidios`
}

/**
 * El primer pago va destacado en azul noche; los demás, en papel. Un bono se usa solo en comercios.
 * `ancha`: ocupa las dos columnas de la tablet y el computador (con un número impar de pagos).
 */
function TarjetaPago({ pago, destacada, ancha = false }: { pago: PagoPendiente; destacada: boolean; ancha?: boolean }) {
  const esBono = pago.programa.tipo === 'bono'
  const contenido = (
    <>
      <div className="flex items-center justify-between gap-2.5">
        <span className="text-[17px] font-bold">{pago.programa.nombre}</span>
        {!esBono && (
          <Icono className="size-[22px]" stroke={destacada ? '#F5F0E6' : 'var(--foreground)'} strokeWidth={2.4}>
            <path d="M9 6l6 6-6 6" />
          </Icono>
        )}
      </div>
      <span className="text-[15px] opacity-85">{esBono ? 'Bono · se usa en comercios autorizados' : nombreTipo(pago)}</span>
      <span className="ancho mt-0.5 text-[40px] leading-[1.05] font-extrabold [overflow-wrap:anywhere] max-[360px]:text-[34px] pc:text-[44px]">{formatearMonto(pago.monto)}</span>
      <Vence fecha={pago.vigenciaFin} color={destacada ? '#F6A623' : 'var(--color-tinta-suave)'} />
    </>
  )
  const clases = cn(
    'flex min-w-0 flex-col gap-1.5 rounded-[20px] border-[1.5px] p-[18px] no-underline pc:p-6',
    ancha && 'md:col-span-2',
    destacada ? 'border-foreground bg-noche text-arena hover:text-arena' : 'border-linea bg-papel text-foreground hover:border-foreground hover:text-foreground',
  )
  if (esBono) return <div className={clases}>{contenido}</div>
  return (
    <Link to={`/beneficiario/subsidios/${pago.programa.id}`} className={clases}>
      {contenido}
    </Link>
  )
}

function FilaCuenta({ cuenta }: { cuenta: Cuenta | null }) {
  const verificada = cuenta?.estado === 'Verificada'
  const texto = verificada ? (
    <>
      <b>Tu cuenta {cuenta.llave ?? cuenta.billeteraCorta}</b> · verificada
    </>
  ) : cuenta?.estado === 'PorVerificar' ? (
    <>
      <b>Tu cuenta</b> · falta aprobar el enlace
    </>
  ) : (
    <>
      <b>Enlaza tu cuenta</b> para cobrar sin ir a un punto
    </>
  )
  return (
    <Link to="/beneficiario/cuenta" className="flex min-h-14 items-center gap-3 rounded-[14px] bg-nota px-3.5 text-foreground no-underline hover:text-foreground">
      <Icono className="size-[22px]" stroke="var(--foreground)">
        <path d="M3 7a2 2 0 012-2h13v4" />
        <path d="M3 7v11a2 2 0 002 2h15V9H5a2 2 0 01-2-2z" />
        <path d="M16 14h.01" />
      </Icono>
      <span className="flex-1 text-base">{texto}</span>
      <Icono className="size-5" stroke="var(--foreground)">
        <path d="M9 6l6 6-6 6" />
      </Icono>
    </Link>
  )
}

function FilaCobrado({ cobro }: { cobro: Cobro }) {
  return (
    <li className="border-t border-linea">
      <Link to={`/beneficiario/cobros/${cobro.id}`} className="flex items-center gap-3 py-3 text-foreground no-underline hover:text-foreground">
        <span className="flex flex-1 flex-col gap-0.5">
          <span className="text-base font-bold">{cobro.programa.nombre}</span>
          <span className="text-sm text-tinta-suave">
            {cobro.referencia} · {formatearFechaHora(cobro.actualizado)}
          </span>
        </span>
        {cobro.monto && <span className="text-base font-bold">{formatearMonto(cobro.monto)}</span>}
      </Link>
    </li>
  )
}
