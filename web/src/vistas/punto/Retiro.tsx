// El retiro en el punto (HU-26, HU-27): después de elegir el subsidio, el punto dice cuánto retira la
// persona (todo o una parte) y, si compró algo en la tienda, cuánto fue. Antes de pedir el PIN ve el
// desglose: el retiro, la compra, el EFECTIVO que entrega y lo que le queda a la persona. La compra
// es parte del retiro, no un descuento aparte. La API vuelve a validar todo.
import { Lock, ShoppingBag } from 'lucide-react'
import type { ReactNode } from 'react'
import type { PagoPendiente } from '@/api/punto'
import type { Monto } from '@/api/tipos'
import { Boton as BotonMedio } from '@/componentes/Comun'
import { MensajeError, PantallaCelular } from '@/componentes/piezas'
import { textoMonto } from '@/lib/montos'
import { useEnComputador } from '@/lib/useEnComputador'
import { cn } from '@/lib/utils'
import { calcularRetiro, cedulaCorta, primerNombre, type ConsultaCedula } from './datos'
import { PidiendoPago } from './Espera'
import { Boton, Cabecera, NotaGris, PantallaPuntoEscritorio, PasosCobro, VolverEscritorio } from './piezas'

/**
 * El desglose de un retiro: lo que sale del subsidio, la compra, lo que se entrega en la mano y lo
 * que le queda a la persona. El efectivo va resaltado: es lo único que el punto saca de su caja.
 */
export function Desglose({
  retiro,
  venta,
  efectivo,
  saldo,
  grande = false,
  className,
}: {
  retiro: Monto | null
  venta: Monto | null
  efectivo: Monto | null
  saldo: Monto | null
  grande?: boolean
  className?: string
}) {
  const fila = (etiqueta: string, valor: ReactNode, apoyo?: string) => (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="flex flex-col">
        <span className={grande ? 'text-[17px]' : 'text-base'}>{etiqueta}</span>
        {apoyo && <span className="text-sm text-tinta-suave">{apoyo}</span>}
      </dt>
      <dd className={cn('m-0 font-bold whitespace-nowrap', grande ? 'text-xl' : 'text-lg')}>{valor}</dd>
    </div>
  )
  return (
    <dl aria-label="Desglose del retiro" className={cn('m-0 flex flex-col rounded-[18px] border-[1.5px] border-linea bg-papel', grande ? 'gap-3.5 p-6' : 'gap-3 p-4', className)}>
      {fila('Retiro del subsidio', textoMonto(retiro), 'Lo que sale del subsidio')}
      {venta && fila('Compra en la tienda', `− ${textoMonto(venta)}`, 'Hace parte del retiro')}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-2xl bg-noche px-4 py-3 text-arena">
        <dt className={cn('font-bold', grande ? 'text-lg' : 'text-base')}>Entrega en efectivo</dt>
        <dd className={cn('cifra m-0 text-ambar [overflow-wrap:anywhere]', grande ? 'text-[44px] leading-none' : 'text-[34px] leading-none')}>{textoMonto(efectivo)}</dd>
      </div>
      {fila('Le queda para después', textoMonto(saldo))}
    </dl>
  )
}

/** Un campo de pesos: el signo fuera del input y el teclado numérico en el celular. */
function CampoPesos({ id, valor, cambiar, error, etiqueta, ayuda }: { id: string; valor: string; cambiar: (v: string) => void; error: string | null; etiqueta: string; ayuda?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-base font-bold">
        {etiqueta}
      </label>
      {ayuda && (
        <span id={`${id}-ayuda`} className="-mt-1 text-sm text-tinta-suave">
          {ayuda}
        </span>
      )}
      <div className="flex items-center rounded-[14px] border-2 border-foreground bg-papel focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ambar">
        <span aria-hidden className="pl-4 text-2xl font-bold text-tinta-suave">
          $
        </span>
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          value={valor}
          onChange={(e) => cambiar(e.target.value.replace(/[^\d.]/g, ''))}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined}
          className="h-14 w-full min-w-0 border-0 bg-transparent px-2 font-sans text-2xl font-bold text-foreground outline-none"
        />
      </div>
      <MensajeError id={`${id}-error`}>{error}</MensajeError>
    </div>
  )
}

/** Dos o más opciones grandes, como botones de radio (cómodas con el dedo). */
function Opciones<T extends string>({ etiqueta, opciones, valor, cambiar }: { etiqueta: string; opciones: Array<[T, ReactNode]>; valor: T; cambiar: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="grid grid-cols-2 gap-2">
      {opciones.map(([v, contenido]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={valor === v}
          onClick={() => cambiar(v)}
          className={cn(
            'flex min-h-14 cursor-pointer flex-col items-start justify-center rounded-[14px] border-2 px-3.5 py-2 text-left font-sans',
            valor === v ? 'border-foreground bg-ambar text-noche' : 'border-linea bg-papel text-foreground hover:border-foreground',
          )}
        >
          {contenido}
        </button>
      ))}
    </div>
  )
}

function Formulario({ consulta, p, computador }: { consulta: ConsultaCedula; p: PagoPendiente; computador: boolean }) {
  const f = consulta.retiro
  const calculo = calcularRetiro(p, f)
  const nombre = primerNombre(consulta.opciones!.persona.nombre)
  const pedir = () => calculo.pedido && void consulta.pedir(p.programa.id, calculo.pedido)

  const cuanto = (
    <section aria-labelledby="titulo-cuanto" className="flex flex-col gap-3">
      <h2 id="titulo-cuanto" className={cn('m-0 font-extrabold', computador ? 'text-[21px]' : 'text-lg')}>
        ¿Cuánto va a retirar?
      </h2>
      <Opciones
        etiqueta="Cuánto va a retirar"
        valor={f.modo}
        cambiar={(modo) => consulta.cambiarRetiro({ modo })}
        opciones={[
          [
            'todo',
            <>
              <span className="text-base font-bold">Todo</span>
              <span className="text-sm">{textoMonto(p.monto)}</span>
            </>,
          ],
          [
            'parte',
            <>
              <span className="text-base font-bold">Una parte</span>
              <span className="text-sm">El resto queda para después</span>
            </>,
          ],
        ]}
      />
      {f.modo === 'parte' && (
        <CampoPesos
          id="retiro-monto"
          etiqueta="Valor del retiro"
          ayuda={p.montoMinimo ? `Mínimo ${textoMonto(p.montoMinimo)}, salvo que sea todo lo que queda.` : undefined}
          valor={f.monto}
          cambiar={(monto) => consulta.cambiarRetiro({ monto })}
          error={f.monto ? calculo.errorMonto : null}
        />
      )}
    </section>
  )

  const compra = (
    <section aria-labelledby="titulo-compra" className="flex flex-col gap-3">
      <h2 id="titulo-compra" className={cn('m-0 flex items-center gap-2 font-extrabold', computador ? 'text-[21px]' : 'text-lg')}>
        <ShoppingBag aria-hidden className="size-5" /> ¿Compró algo en la tienda?
      </h2>
      <Opciones
        etiqueta="Si compró algo en la tienda"
        valor={f.conVenta ? 'si' : 'no'}
        cambiar={(v) => consulta.cambiarRetiro({ conVenta: v === 'si' })}
        opciones={[
          ['no', <span key="no" className="text-base font-bold">No, todo en efectivo</span>],
          ['si', <span key="si" className="text-base font-bold">Sí, registrar compra</span>],
        ]}
      />
      {f.conVenta && (
        <>
          <CampoPesos
            id="retiro-venta"
            etiqueta="Valor de la compra"
            ayuda="Sale del mismo retiro: se entrega menos efectivo. Queda lista para facturar."
            valor={f.venta}
            cambiar={(venta) => consulta.cambiarRetiro({ venta })}
            error={f.venta ? calculo.errorVenta : null}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="retiro-descripcion" className="text-base font-bold">
              Qué compró <span className="font-normal text-tinta-suave">(opcional)</span>
            </label>
            <input
              id="retiro-descripcion"
              maxLength={120}
              placeholder="Por ejemplo: mercado"
              value={f.descripcion}
              onChange={(e) => consulta.cambiarRetiro({ descripcion: e.target.value })}
              className="h-12 w-full rounded-[14px] border-2 border-linea bg-papel px-3.5 font-sans text-base text-foreground focus:border-foreground"
            />
          </div>
        </>
      )}
    </section>
  )

  const desglose = <Desglose retiro={calculo.retiro} venta={calculo.venta} efectivo={calculo.efectivo} saldo={calculo.saldo} grande={computador} />
  const pedirPin = consulta.pidiendo ? (
    <PidiendoPago />
  ) : computador ? (
    <BotonMedio tamano="grande" className="w-full" onClick={pedir} disabled={!calculo.pedido || consulta.enviando}>
      Pedir el PIN a {nombre}
    </BotonMedio>
  ) : (
    <Boton onClick={pedir} disabled={!calculo.pedido || consulta.enviando}>
      Pedir el PIN a {nombre}
    </Boton>
  )
  const error = <MensajeError id="retiro-error">{consulta.error}</MensajeError>
  const nota = (
    <NotaGris icono={Lock}>
      Revisa el desglose con {nombre}. Antes del PIN no se mueve dinero; entrega el efectivo solo cuando la pantalla diga Pagado.
    </NotaGris>
  )

  if (computador) {
    return (
      <div className="grid gap-6 pc:grid-cols-[minmax(0,1fr)_minmax(340px,440px)] pc:items-start">
        <div className="flex flex-col gap-6 rounded-[20px] border-[1.5px] border-linea bg-papel p-6">
          {cuanto}
          {compra}
        </div>
        <div className="flex flex-col gap-4 pc:sticky pc:top-6">
          <h2 className="m-0 text-[21px] font-extrabold">Resumen</h2>
          {desglose}
          {error}
          {pedirPin}
          {nota}
        </div>
      </div>
    )
  }
  return (
    <>
      {cuanto}
      {compra}
      <h2 className="m-0 mt-1 text-lg font-extrabold">Resumen</h2>
      {desglose}
      {error}
      {pedirPin}
      {nota}
    </>
  )
}

/** P1c / PD1b: el retiro del subsidio elegido, en el celular o en el computador. */
export function PantallaRetiro({ consulta }: { consulta: ConsultaCedula }) {
  const computador = useEnComputador()
  const p = consulta.elegido!
  const o = consulta.opciones!
  const subtitulo = `${o.persona.nombre} · C.C. ${cedulaCorta(consulta.cedula)}`
  const saldo = (
    <p className={cn('m-0', computador ? 'text-lg' : 'text-[17px] leading-[1.4]')}>
      {p.programa.nombre}: tiene <b>{textoMonto(p.monto)}</b> disponibles
      {p.cobrado.valor !== '0' && <span className="text-tinta-suave"> (ya retiró {textoMonto(p.cobrado)} de {textoMonto(p.asignado)})</span>}.
    </p>
  )

  if (computador) {
    return (
      <PantallaPuntoEscritorio volver={<VolverEscritorio onClick={consulta.volverAPagos}>Pagos de {o.persona.nombre}</VolverEscritorio>} subtitulo={subtitulo} titulo="Retiro">
        {saldo}
        <Formulario consulta={consulta} p={p} computador />
      </PantallaPuntoEscritorio>
    )
  }
  return (
    <PantallaCelular className="gap-4">
      <Cabecera alVolver={consulta.volverAPagos} etiquetaVolver="Volver a los pagos de esta cédula" titulo="Retiro" subtitulo={subtitulo} />
      <PasosCobro paso="Pago" />
      <h1 className="sr-only">Retiro</h1>
      {saldo}
      <Formulario consulta={consulta} p={p} computador={false} />
    </PantallaCelular>
  )
}
