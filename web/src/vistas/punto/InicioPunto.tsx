// Inicio del punto: su caja de hoy, «Nuevo cobro» y los cobros de hoy (P0 en el celular, PD0 en el
// computador, con el nuevo cobro al lado de los cobros de hoy). La sede de un comercio cobra compras
// con bono (VentaConBono).
import { Plus, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router'
import { Cargando, ErrorCarga } from '@/componentes/Comun'
import { Marca, PantallaCelular } from '@/componentes/piezas'
import { plural } from '@/lib/textos'
import { useEnComputador } from '@/lib/useEnComputador'
import { ListaCobrosHoy, TablaCobrosHoy } from './CobrosDeHoy'
import { cifrasCaja, useConsultaCedula, useHoy, usePunto } from './datos'
import { FormCedulaEscritorio, PagosEscritorio } from './NuevoCobro'
import { AvisoArena, BotonEnlace, CuadroVolver, PantallaPuntoEscritorio, TarjetaCifra, VolverEscritorio } from './piezas'
import { VentaConBono } from './VentaConBono'
import { BotonTema } from '@/componentes/BotonTema'

/** P0: el inicio del punto en el celular. */
function InicioCelular() {
  const punto = usePunto()
  const { caja, cobros } = useHoy(punto.id)
  const c = cifrasCaja(caja.datos)
  return (
    <PantallaCelular className="gap-3.5">
      <div className="flex items-center gap-2.5">
        <CuadroVolver a="/" etiqueta="Volver a elegir rol" />
        <Marca />
        <BotonTema className="ml-auto" />
      </div>
      <div className="-mt-1.5 text-[15px] text-tinta-suave">{punto.nombre} · Punto de retiro</div>
      <h1 className="sr-only">Inicio del punto</h1>
      <Link to="/punto/caja" aria-label="Ver mi caja" className="grid grid-cols-2 gap-2.5 text-bloque-texto no-underline hover:text-bloque-texto">
        <span className="bloque flex min-w-0 flex-col gap-0.5 rounded-2xl px-3.5 py-3">
          <span className="text-sm">Retiros pagados hoy</span>
          <span className="cifra text-2xl tracking-[-0.03em] [overflow-wrap:anywhere]">{c.entregado}</span>
          <span className="text-[13px] text-noche-texto-tenue">{c.reembolsoTexto}</span>
        </span>
        <span className="bloque flex min-w-0 flex-col gap-0.5 rounded-2xl px-3.5 py-3">
          <span className="text-sm">Adelantado de tu caja</span>
          <span className="cifra text-2xl tracking-[-0.03em] text-ambar [overflow-wrap:anywhere]">{c.adelantado}</span>
          <span className="text-[13px] text-noche-texto-tenue">{c.adelantadoTexto}</span>
        </span>
      </Link>
      <BotonEnlace to="/punto/nuevo">
        <Plus aria-hidden strokeWidth={2.6} />
        Nuevo cobro
      </BotonEnlace>
      <section aria-labelledby="titulo-hoy" className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-baseline justify-between">
          <h2 id="titulo-hoy" className="m-0 text-lg font-extrabold">
            Cobros de hoy
          </h2>
          {cobros.datos && <span className="text-sm text-tinta-suave">{plural(cobros.datos.length, 'cobro')}</span>}
        </div>
        <ListaCobrosHoy cobros={cobros.datos} cargando={cobros.cargando} />
      </section>
      <AvisoArena icono={ShieldCheck} className="items-center rounded-[14px] px-3.5 py-3 text-[15px] leading-[1.35]">
        Entrega efectivo solo cuando la pantalla diga Pagado.
      </AvisoArena>
    </PantallaCelular>
  )
}

/** PD0: el inicio en el computador. Al consultar una cédula con pagos se pasa a sus pagos (PD1). */
function InicioEscritorio() {
  const punto = usePunto()
  const { caja, cobros } = useHoy(punto.id)
  const consulta = useConsultaCedula(punto.id)
  const c = cifrasCaja(caja.datos)
  if (consulta.opciones) return <PagosEscritorio consulta={consulta} />
  return (
    <PantallaPuntoEscritorio volver={<VolverEscritorio a="/">Elegir rol</VolverEscritorio>} subtitulo="Punto de retiro" titulo={punto.nombre}>
      <div className="flex flex-wrap gap-4">
        <TarjetaCifra etiqueta="Retiros pagados hoy" apoyo={plural(c.pagados, 'retiro')}>
          {c.entregado}
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Te reembolsaron" apoyo={c.enCamino ? c.reembolsoTexto : 'Todo lo pagado ya está en tu billetera'}>
          {c.reembolsado}
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Adelantado de tu caja" apoyo={c.adelantadoTexto} noche>
          {c.adelantado}
        </TarjetaCifra>
      </div>
      <div className="flex flex-wrap items-start gap-6">
        <FormCedulaEscritorio consulta={consulta} />
        <section aria-labelledby="titulo-hoy" className="flex min-w-0 flex-[999_1_560px] flex-col gap-4 rounded-[20px] border-[1.5px] border-linea bg-papel p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="titulo-hoy" className="m-0 text-[21px] font-extrabold">
              Cobros de hoy
            </h2>
            {cobros.datos && (
              <span className="text-[15px] text-tinta-suave">
                {plural(cobros.datos.length, 'cobro')} · {c.enCurso} en curso
              </span>
            )}
          </div>
          <TablaCobrosHoy cobros={cobros.datos} cargando={cobros.cargando} />
        </section>
      </div>
    </PantallaPuntoEscritorio>
  )
}

/**
 * El inicio depende del tipo del punto: un punto de retiro entrega efectivo de subsidios; la sede de
 * un comercio cobra compras con bono. Hasta saber cuál es, se espera la lista de puntos.
 */
export function InicioPunto() {
  const punto = usePunto()
  const computador = useEnComputador()
  if (!punto.datos) {
    const carga = punto.error ? <ErrorCarga mensaje={punto.error} reintentar={punto.recargar} /> : <Cargando texto="Abriendo tu caja…" />
    return computador ? <PantallaPuntoEscritorio>{carga}</PantallaPuntoEscritorio> : <PantallaCelular className="gap-4">{carga}</PantallaCelular>
  }
  if (punto.datos.tipo === 'compra') return <VentaConBono />
  return computador ? <InicioEscritorio /> : <InicioCelular />
}
