// Demo del tatú animado en /demo/tatu (no está enlazada desde ninguna vista), como la del piloto:
// el de los pagos (TatuEnrolla) y el de las pantallas de carga (TatuAnimado), para verlos sin pagar.
import { useState } from 'react'
import { Boton, Titulo } from '@/componentes/Comun'
import { Marca } from '@/componentes/piezas'
import { POSES, VIEWBOX_POSES } from '@/componentes/tatu/poses'
import { TatuAnimado, type EstadoTatu } from '@/componentes/tatu/TatuAnimado'
import { TatuEnrolla } from '@/componentes/tatu/TatuEnrolla'
import { cn } from '@/lib/utils'

const VARIANTES = [
  { id: 'rodar', titulo: 'Solo rodar', texto: 'La carga en línea (CargandoEnLinea). Al quedar pagado termina la vuelta y se detiene derecho.' },
  {
    id: 'cerradura',
    titulo: 'Rodar y abrir la cerradura',
    texto: 'La de las pantallas de carga (Cargando y TatuCargando): además la cerradura late; al quedar pagado se pone verde con un salto corto.',
  },
] as const

export default function DemoTatu() {
  const [estado, setEstado] = useState<EstadoTatu>('pagando')
  const [sinMovimiento, setSinMovimiento] = useState(false)
  const [vuelta, setVuelta] = useState(0)
  const [fallo, setFallo] = useState(false)
  const [finalError, setFinalError] = useState<'de-pie' | 'logo'>('logo')

  return (
    <div className="min-h-dvh bg-arena text-noche">
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 pt-6 pb-12 sm:px-6">
        <Marca />
        <div className="flex flex-col gap-2">
          <Titulo>El tatú animado</Titulo>
          <p className="m-0 max-w-[640px] text-tinta-suave">
            El de los pagos y el de las pantallas de carga, con el mismo estado. Prueba pagar, fallar y volver, y cómo queda para quien pide menos
            movimiento en su sistema.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Boton
            tamano="grande"
            onClick={() => {
              // Al volver a «Pagando…», el de los pagos empieza de nuevo
              if (estado === 'pagado') setVuelta((v) => v + 1)
              setFallo(false)
              setEstado((e) => (e === 'pagando' ? 'pagado' : 'pagando'))
            }}
          >
            {estado === 'pagando' ? 'Simular que quedó pagado' : 'Volver a «Pagando…»'}
          </Boton>
          <label className="flex min-h-11 items-center gap-2 text-[15px]">
            <input type="checkbox" className="size-5 accent-azul" checked={sinMovimiento} onChange={(e) => setSinMovimiento(e.target.checked)} />
            Sin movimiento (preferencia del sistema)
          </label>
        </div>

        <section className="flex flex-col gap-5 rounded-2xl border border-linea bg-papel p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="m-0 text-xl font-bold">Los pagos · se enrolla</h2>
              <p className="m-0 max-w-[560px] text-[15px] text-tinta-suave">
                El de la pantalla del cobro. De pie y alerta, se agazapa, arquea el lomo, se enrolla y cae como bolita. Mientras paga rueda con las
                cuatro bolitas dibujadas. Si sale bien, frena, asoma la cabeza (pose 8) y pasa al logo con la cerradura verde; si sale mal, frena y
                termina en el logo con la cerradura roja (o se desenrolla hasta quedar de pie).
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="flex min-h-11 items-center gap-2 text-[15px]">
                Al fallar
                <select
                  className="min-h-11 rounded-lg border border-control bg-arena px-2 font-sans text-[15px] text-noche"
                  value={finalError}
                  onChange={(e) => setFinalError(e.target.value as 'de-pie' | 'logo')}
                >
                  <option value="logo">logo con cerradura roja (la app)</option>
                  <option value="de-pie">vuelve a pararse</option>
                </select>
              </label>
              <Boton variante="contorno" onClick={() => setFallo(true)} disabled={fallo || estado === 'pagado'}>
                Simular que falló
              </Boton>
              <Boton
                variante="contorno"
                onClick={() => {
                  setEstado('pagando')
                  setFallo(false)
                  setVuelta((v) => v + 1)
                }}
              >
                Repetir desde el principio
              </Boton>
            </div>
          </div>
          <div className="flex flex-col items-center gap-3 py-2 text-center" role="status">
            <TatuEnrolla key={`${vuelta}-${sinMovimiento}`} estado={fallo ? 'fallido' : estado} finalError={finalError} sinMovimiento={sinMovimiento || undefined} className="w-56" />
            <p className="m-0 mt-2 text-[28px] leading-tight font-bold">{fallo ? 'El pago falló' : estado === 'pagando' ? 'Pagando…' : 'Pagado'}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-3 border-t border-linea pt-4">
            {POSES.map((d, i) => (
              <figure key={i} className="m-0 flex flex-col items-center gap-1">
                <svg viewBox={VIEWBOX_POSES} className="h-12 w-[68px]">
                  <path d={d} fill="var(--foreground)" fillRule="evenodd" />
                </svg>
                <figcaption className="text-xs text-tinta-suave">{i + 1}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        <div className="grid gap-5 md:grid-cols-2">
          {VARIANTES.map((v) => (
            <section key={v.id} className="flex flex-col gap-5 rounded-2xl border border-linea bg-papel p-6">
              <div className="flex flex-col gap-1">
                <h2 className="m-0 text-xl font-bold">{v.titulo}</h2>
                <p className="m-0 text-[15px] text-tinta-suave">{v.texto}</p>
              </div>
              <div className="flex flex-col items-center gap-3 py-4 text-center" role="status">
                <TatuAnimado key={String(sinMovimiento)} estado={estado} variante={v.id} sinMovimiento={sinMovimiento || undefined} className="size-28" />
                <p className={cn('m-0 mt-2 text-[28px] leading-tight font-bold', estado === 'pagado' && 'text-pagado')}>{estado === 'pagando' ? 'Pagando…' : 'Pagado'}</p>
              </div>
            </section>
          ))}
        </div>

        <section className="flex flex-col gap-3 rounded-2xl border border-linea bg-papel p-6">
          <h2 className="m-0 text-lg font-bold">Tamaños</h2>
          <div className="flex flex-wrap items-end gap-8">
            {(['size-16', 'size-28', 'size-40'] as const).map((t) => (
              <TatuAnimado key={t + String(sinMovimiento)} estado={estado} variante="cerradura" sinMovimiento={sinMovimiento || undefined} className={t} />
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
