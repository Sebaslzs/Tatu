// Mientras se paga en el punto: pidiendo el cobro (antes del PIN) y pagando (después del PIN). Al
// pagar, la barra de carga es el tatú: de pie se enrolla y rueda, y la pantalla del resultado termina
// su animación (TatuResultado).
import { Check, Hand } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { llegaRodando, marcarPagando, TatuEnrolla } from '@/componentes/tatu/TatuEnrolla'

/** Segundos que lleva el cobro en Pagando, contados desde `desde` (ISO). */
function useSegundosDesde(desde: string | null) {
  const [s, setS] = useState(0)
  useEffect(() => {
    if (!desde) return
    const calcular = () => setS(Math.max(0, (Date.now() - Date.parse(desde)) / 1000))
    calcular()
    const t = setInterval(calcular, 500)
    return () => clearInterval(t)
  }, [desde])
  return s
}

/**
 * «Pagando…» (P4): «PIN confirmado», el tatú rodando y el aviso de no entregar el efectivo hasta ver
 * «Pagado». Pasados 10 s avisa que tarda más de lo normal (RNF-05).
 */
export function EsperaPagando({ cobroId, desde, children }: { cobroId: string; desde: string | null; children: ReactNode }) {
  const tarda = useSegundosDesde(desde) > 10
  // Si se vio rodando antes (se volvió a abrir este cobro), sigue rodando; y el resultado llega rodando
  const [inicio] = useState<'rodando' | 'de-pie'>(() => (llegaRodando(cobroId) ? 'rodando' : 'de-pie'))
  useEffect(() => marcarPagando(cobroId), [cobroId])

  return (
    <>
      <div className="mt-1.5 flex flex-col gap-4 rounded-[22px] bg-noche px-5 py-[22px] text-arena">
        <span className="inline-flex items-center gap-2 text-base font-semibold">
          <Check aria-hidden className="size-5 text-ambar" strokeWidth={2.5} />
          PIN confirmado
        </span>
        <p className="cifra m-0 text-[36px]">Pagando…</p>
        <p className="m-0 text-[17px] leading-[1.4]">{children}</p>
        <TatuEnrolla estado="pagando" inicio={inicio} sobreColor className="w-44 self-center" />
        <span className="text-[15px] text-noche-texto-tenue">Suele tardar unos segundos.</span>
      </div>

      <div role="status" className="flex items-center gap-3 rounded-[18px] border-[2.5px] border-foreground bg-papel p-4">
        <Hand aria-hidden className="size-[34px] flex-none" strokeWidth={2} />
        <div className="flex flex-col gap-0.5">
          <span className="text-[21px] font-extrabold">No entregues efectivo todavía</span>
          <span className="text-[15px] text-tinta-suave">Espera a que la pantalla diga Pagado.</span>
        </div>
      </div>

      {tarda && (
        <p role="alert" className="m-0 rounded-[14px] bg-pagando-fondo px-4 py-3 text-base font-semibold text-pagando">
          Está tardando más de lo normal. No entregues el efectivo todavía.
        </p>
      )}
    </>
  )
}

/**
 * Mientras se pide el cobro de un pago elegido (unos segundos), en la misma pantalla y sin el tatú:
 * después sale el PIN o, si se rechazó al pedirlo, la pantalla del resultado.
 */
export function PidiendoPago() {
  return (
    <div role="status" className="flex flex-col gap-2 rounded-[22px] bg-noche px-5 py-[22px] text-arena">
      <p className="cifra m-0 text-[30px]">Pidiendo el pago…</p>
      <span className="text-[15px] text-noche-texto-tenue">Suele tardar unos segundos.</span>
    </div>
  )
}
