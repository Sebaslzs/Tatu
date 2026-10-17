// Nuevo cobro (HU-10): el punto digita la cédula (P1), ve sus pagos disponibles (P1b) y elige uno;
// la persona confirma después con su PIN. En el computador la cédula va dentro del inicio (PD0) y
// los pagos en su propia pantalla (PD1).
import { ChevronRight, Lock, ShieldCheck } from 'lucide-react'
import { Navigate } from 'react-router'
import { Boton as BotonMedio } from '@/componentes/Comun'
import { MensajeError, PantallaCelular } from '@/componentes/piezas'
import { textoMonto } from '@/lib/montos'
import { formatDiaMesCorto } from '@/lib/textos'
import { useEnComputador } from '@/lib/useEnComputador'
import { cn } from '@/lib/utils'
import { cedulaCorta, textoPagos, useConsultaCedula, usePunto, type ConsultaCedula } from './datos'
import { PidiendoPago } from './Espera'
import { AvisoArena, Boton, Cabecera, ChipPago, NotaGris, PantallaPuntoEscritorio, PasosCobro, VolverEscritorio } from './piezas'

/** El campo grande de la cédula: 68 px y letra de 28 px en el celular, 64 px en el computador. */
function CampoCedula({ consulta, computador = false }: { consulta: ConsultaCedula; computador?: boolean }) {
  return (
    <input
      id="cedula"
      inputMode="numeric"
      autoComplete="off"
      placeholder="Número de cédula"
      value={consulta.cedula}
      aria-describedby={consulta.error ? 'cedula-error' : 'cedula-ayuda'}
      aria-invalid={consulta.error ? true : undefined}
      onChange={(e) => consulta.cambiarCedula(e.target.value)}
      className={cn(
        'box-border w-full rounded-[14px] border-2 border-foreground px-4 font-sans text-[28px] font-bold tracking-[0.04em] text-foreground placeholder:font-normal placeholder:tracking-normal placeholder:text-tinta-suave',
        computador ? 'h-16 bg-papel' : 'h-[68px] bg-papel',
      )}
    />
  )
}

/** PD0, columna izquierda: el formulario de la cédula en el computador. */
export function FormCedulaEscritorio({ consulta }: { consulta: ConsultaCedula }) {
  return (
    <form
      noValidate
      className="flex min-w-0 flex-[1_1_380px] flex-col gap-4 rounded-[20px] border-[1.5px] border-linea bg-papel p-6"
      onSubmit={(e) => {
        e.preventDefault()
        void consulta.consultar()
      }}
    >
      <h2 className="ancho m-0 text-2xl font-extrabold">Nuevo cobro</h2>
      <label htmlFor="cedula" className="text-[17px] font-bold">
        Número de cédula
      </label>
      <span id="cedula-ayuda" className="-mt-2.5 text-[15px] text-tinta-suave">
        Pide la cédula original y digita el número.
      </span>
      <CampoCedula consulta={consulta} computador />
      <MensajeError id="cedula-error">{consulta.error}</MensajeError>
      <BotonMedio type="submit" tamano="grande" className="w-full" disabled={consulta.enviando}>
        {consulta.enviando ? 'Consultando…' : 'Consultar'}
      </BotonMedio>
      <AvisoArena icono={ShieldCheck} className="rounded-[14px] text-[15px]">
        Entrega efectivo solo cuando la pantalla diga Pagado. La cédula sola no autoriza el cobro.
      </AvisoArena>
    </form>
  )
}

/** Una tarjeta de pago de la cédula (P1b / PD1). En el celular toda la tarjeta es el botón. */
function TarjetaPago({ consulta, i, computador }: { consulta: ConsultaCedula; i: number; computador: boolean }) {
  const p = consulta.opciones!.pagos[i]!
  const pausado = p.programa.estado === 'Pausado'
  const encabezado = (
    <div className="flex items-start justify-between gap-2.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className={cn('font-extrabold', computador ? 'text-[19px]' : 'text-[17px]')}>{p.programa.nombre}</span>
        <span className={cn('text-tinta-suave', computador ? 'text-[15px]' : 'text-sm')}>Hasta el {formatDiaMesCorto(p.vigenciaFin)}</span>
      </div>
      <ChipPago pausado={pausado} />
    </div>
  )
  const monto = <span className={cn('cifra', computador ? 'text-[44px]' : 'text-[32px]')}>{textoMonto(p.monto)}</span>

  if (computador) {
    return (
      <div className="flex flex-[1_1_360px] flex-col gap-2.5 rounded-[20px] border-2 border-foreground bg-papel p-[22px]">
        {encabezado}
        {monto}
        <span className="text-[15px] text-tinta-suave">Se entrega el valor completo</span>
        <BotonMedio onClick={() => void consulta.pedir(p.programa.id)} disabled={consulta.enviando || pausado}>
          Pagar este subsidio
        </BotonMedio>
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={() => void consulta.pedir(p.programa.id)}
      disabled={consulta.enviando || pausado}
      className="flex w-full cursor-pointer flex-col gap-2 rounded-[18px] border-2 border-foreground bg-papel p-4 text-left font-sans text-foreground disabled:cursor-not-allowed disabled:opacity-60"
    >
      {encabezado}
      {monto}
      <span className="flex items-center justify-between gap-2.5">
        <span className="text-[15px] text-tinta-suave">Se entrega el valor completo</span>
        <span className="inline-flex items-center gap-1 text-base font-bold text-enlace">
          Pagar <ChevronRight aria-hidden className="size-[18px]" strokeWidth={2.4} />
        </span>
      </span>
    </button>
  )
}

/** PD1: los pagos de la cédula en el computador. */
export function PagosEscritorio({ consulta }: { consulta: ConsultaCedula }) {
  const o = consulta.opciones!
  return (
    <PantallaPuntoEscritorio
      volver={<VolverEscritorio onClick={consulta.volver}>Nuevo cobro</VolverEscritorio>}
      subtitulo={`C.C. ${cedulaCorta(consulta.cedula)}`}
      titulo={`Pagos de ${o.persona.nombre}`}
    >
      <p className="m-0 text-lg">
        Tiene <b>{textoPagos(o.pagos.length)}</b>. Cada retiro paga un subsidio completo; antes del PIN no se mueve dinero.
      </p>
      <MensajeError id="pagos-error">{consulta.error}</MensajeError>
      {consulta.pidiendo ? (
        <div className="max-w-[520px]">
          <PidiendoPago />
        </div>
      ) : (
        <div className="flex flex-wrap gap-5">
          {o.pagos.map((p, i) => (
            <TarjetaPago key={p.programa.id} consulta={consulta} i={i} computador />
          ))}
        </div>
      )}
    </PantallaPuntoEscritorio>
  )
}

/** P1 y P1b: «Nuevo cobro» en el celular. En el computador va dentro del inicio (PD0). */
export function NuevoCobro() {
  const punto = usePunto()
  const computador = useEnComputador()
  const consulta = useConsultaCedula(punto.id)
  const o = consulta.opciones

  // La sede de un comercio no hace retiros: su venta con bono está en el inicio
  if (punto.datos?.tipo === 'compra') return <Navigate to="/punto" replace />
  if (computador) return o ? <PagosEscritorio consulta={consulta} /> : <Navigate to="/punto" replace />

  if (o) {
    return (
      <PantallaCelular className="gap-4">
        <Cabecera alVolver={consulta.volver} etiquetaVolver="Volver a la cédula" titulo="Pagos de esta cédula" subtitulo={`${o.persona.nombre} · C.C. ${cedulaCorta(consulta.cedula)}`} />
        <PasosCobro paso="Pago" />
        <h1 className="sr-only">Pagos de esta cédula</h1>
        <p className="m-0 mt-1 text-[17px] leading-[1.4]">
          Tiene <b>{textoPagos(o.pagos.length)}</b>. Cada retiro paga un subsidio completo.
        </p>
        <MensajeError id="pagos-error">{consulta.error}</MensajeError>
        {consulta.pidiendo ? <PidiendoPago /> : o.pagos.map((p, i) => <TarjetaPago key={p.programa.id} consulta={consulta} i={i} computador={false} />)}
        <NotaGris icono={Lock} className="mt-auto">
          Al elegir un pago, {o.persona.nombre} confirma con su PIN. Antes de eso no se mueve dinero.
        </NotaGris>
      </PantallaCelular>
    )
  }

  return (
    <PantallaCelular className="gap-4">
      <Cabecera volver="/punto" etiquetaVolver="Volver al inicio del punto" titulo="Nuevo cobro" subtitulo={punto.nombre} />
      <PasosCobro paso="Cédula" />
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void consulta.consultar()
        }}
      >
        <div className="mt-2 flex flex-col gap-2">
          <h1 className="m-0 text-xl font-extrabold">
            <label htmlFor="cedula">Número de cédula</label>
          </h1>
          <span id="cedula-ayuda" className="text-base text-tinta-suave">
            Pide la cédula original y digita el número.
          </span>
          <CampoCedula consulta={consulta} />
        </div>
        <MensajeError id="cedula-error">{consulta.error}</MensajeError>
        <Boton type="submit" disabled={consulta.enviando}>
          {consulta.enviando ? 'Consultando…' : 'Consultar'}
        </Boton>
      </form>
      <AvisoArena icono={ShieldCheck} className="mt-auto">
        La cédula sola no autoriza el cobro: el beneficiario confirma con su PIN en este celular.
      </AvisoArena>
    </PantallaCelular>
  )
}
