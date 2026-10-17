// Venta con bono (HU-21): la sede de un comercio cobra una compra con el bono del cliente. Total →
// cédula → «el bono cubre $X, cobra $Y» → PIN → Pagado. El bono paga min(bono, total) (RN-05); el
// resto lo paga el cliente por fuera de Tatú. La cuenta de aquí es solo para mostrarla: el monto lo
// calcula la API.
import { ChevronRight, ShieldCheck, ShoppingBag } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { mensajeDeError } from '@/api/http'
import { pagosDeCedula, pedirCobro, type PagoPendiente, type PagosEnPunto } from '@/api/punto'
import { Boton as BotonMedio } from '@/componentes/Comun'
import { Marca, MensajeError, PantallaCelular } from '@/componentes/piezas'
import { aUnidades, textoMonto } from '@/lib/montos'
import { plural } from '@/lib/textos'
import { useEnComputador } from '@/lib/useEnComputador'
import { cifrasCaja, irAlCobro, useHoy, usePunto } from './datos'
import { AvisoArena, Boton, CuadroVolver, PantallaPuntoEscritorio, VolverEscritorio } from './piezas'

/** Lo que cubre el bono y lo que paga el cliente: el bono paga min(bono, total). */
function reparto(p: PagoPendiente, total: string) {
  const bono = BigInt(p.monto.valor)
  const t = BigInt(total)
  const cubre = bono < t ? bono : t
  return { cubre: { ...p.monto, valor: cubre.toString() }, resto: { ...p.monto, valor: (t - cubre).toString() } }
}

/** La caja de hoy de la sede: lo vendido con bonos, que ya le pagaron. */
function CajaDeHoy({ puntoId }: { puntoId: string }) {
  const { caja } = useHoy(puntoId)
  const c = cifrasCaja(caja.datos)
  return (
    <Link to="/punto/caja" aria-label="Ver mi caja" className="grid grid-cols-2 gap-2.5 text-bloque-texto no-underline hover:text-bloque-texto">
      <span className="bloque flex min-w-0 flex-col gap-0.5 rounded-2xl px-3.5 py-3">
        <span className="text-sm">Ventas con bono hoy</span>
        <span className="cifra text-2xl tracking-[-0.03em] [overflow-wrap:anywhere]">{c.entregado}</span>
        <span className="text-[13px] text-noche-texto-tenue">{plural(c.pagados, 'compra con bono', 'compras con bono')}</span>
      </span>
      <span className="bloque flex min-w-0 flex-col gap-0.5 rounded-2xl px-3.5 py-3">
        <span className="text-sm">Te pagaron los bonos</span>
        <span className="cifra text-2xl tracking-[-0.03em] text-ambar [overflow-wrap:anywhere]">{c.reembolsado}</span>
        <span className="inline-flex items-center gap-1 text-[13px] text-noche-texto-tenue">
          Mi caja <ChevronRight aria-hidden className="size-3.5" />
        </span>
      </span>
    </Link>
  )
}

const CEDULA = /^\d{5,12}$/

export function VentaConBono() {
  const navegar = useNavigate()
  const punto = usePunto()
  const computador = useEnComputador()
  const [total, setTotal] = useState('')
  const [cedula, setCedula] = useState('')
  const [opciones, setOpciones] = useState<PagosEnPunto | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Una llave por intento (CA-10.07): cambia con la cédula y el total
  const [llave, setLlave] = useState(() => crypto.randomUUID())

  const limpiar = () => {
    setOpciones(null)
    setError(null)
  }

  /** Sin programa, la API busca el bono y deja el rechazo en pantalla (HU-13, HU-21). */
  const pedir = async (unidades: string, programaId?: string) => {
    setEnviando(true)
    setError(null)
    try {
      const c = await pedirCobro({
        cedula,
        canal: 'compra',
        puntoId: punto.id,
        programaId,
        totalCompra: unidades,
        llaveIdempotencia: programaId ? `${llave}-${programaId}` : llave,
      })
      irAlCobro(navegar, c)
    } catch (e) {
      setError(mensajeDeError(e))
      setEnviando(false)
    }
  }

  const consultar = async () => {
    // La escala de COP es 2; si el bono es de otra moneda, la API lo dice al cobrar
    const unidades = aUnidades(total, 2)
    if (!unidades || unidades === '0') return setError('Escribe el total de la compra en pesos, sin puntos de miles (por ejemplo, 80000).')
    if (!CEDULA.test(cedula)) return setError('Digita el número de la cédula, sin puntos ni espacios.')
    setEnviando(true)
    limpiar()
    let consulta: PagosEnPunto | null = null
    try {
      consulta = await pagosDeCedula(punto.id, cedula)
    } catch {
      // Cédula sin bonos o desconocida: el cobro lo dice como siempre
    }
    if (consulta?.pagos.length) {
      setOpciones(consulta)
      setEnviando(false)
      return
    }
    await pedir(unidades)
  }

  const unidades = aUnidades(total, 2)
  const campo = 'box-border h-16 w-full rounded-[14px] border-2 border-noche bg-papel px-4 font-sans text-[28px] font-bold tracking-[0.04em] text-noche placeholder:font-normal placeholder:tracking-normal placeholder:text-tinta-suave'

  const formulario = (
    <div className="flex min-w-0 flex-col gap-[18px]">
      <form
        noValidate
        className="flex flex-col gap-[18px]"
        onSubmit={(e) => {
          e.preventDefault()
          void consultar()
        }}
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="total" className="text-[17px] font-bold">
            Total de la compra
          </label>
          <input
            id="total"
            inputMode="decimal"
            autoComplete="off"
            placeholder="80000"
            value={total}
            onChange={(e) => {
              setTotal(e.target.value.replace(/[^\d.,]/g, ''))
              setLlave(crypto.randomUUID())
              limpiar()
            }}
            className={campo}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="cedula" className="text-[17px] font-bold">
            Cédula del cliente
          </label>
          <input
            id="cedula"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Número de cédula"
            value={cedula}
            onChange={(e) => {
              setCedula(e.target.value.replace(/\D/g, ''))
              setLlave(crypto.randomUUID())
              limpiar()
            }}
            className={campo}
          />
        </div>
        <MensajeError id="venta-error">{error}</MensajeError>
        {!opciones && (
          <Boton type="submit" disabled={enviando}>
            {enviando ? 'Consultando…' : 'Consultar bono'}
          </Boton>
        )}
      </form>

      {opciones && unidades && (
        <section aria-labelledby="titulo-bonos" className="flex flex-col gap-3 rounded-[18px] border-2 border-noche bg-papel p-5">
          <h2 id="titulo-bonos" className="m-0 text-xl font-bold">
            {opciones.persona.nombre} tiene {opciones.pagos.length === 1 ? 'un bono que sirve aquí' : `${opciones.pagos.length} bonos que sirven aquí`}
          </h2>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {opciones.pagos.map((p) => {
              const { cubre, resto } = reparto(p, unidades)
              return (
                <li key={p.programa.id}>
                  <button
                    type="button"
                    disabled={enviando}
                    onClick={() => void pedir(unidades, p.programa.id)}
                    className="flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-xl border-[1.5px] border-linea bg-arena px-4 py-3 text-left font-sans text-noche hover:border-noche disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <ShoppingBag aria-hidden className="size-6 shrink-0" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <strong className="text-xl">El bono cubre {textoMonto(cubre)}</strong>
                      <span className="text-[15px]">{resto.valor === '0' ? 'El cliente no paga nada más' : `Cobra ${textoMonto(resto)} al cliente`}</span>
                      <span className="text-sm text-tinta-suave">
                        {p.programa.nombre} · bono de {textoMonto(p.monto)}
                      </span>
                    </span>
                    <ChevronRight aria-hidden className="size-6 shrink-0" />
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="m-0 text-sm text-tinta-suave">Al elegirlo, el cliente confirma con su PIN. El bono se usa una sola vez.</p>
          <BotonMedio variante="contorno" onClick={limpiar} disabled={enviando}>
            Cancelar
          </BotonMedio>
        </section>
      )}

      <AvisoArena icono={ShieldCheck}>Entrega la compra solo cuando veas «Pagado».</AvisoArena>
    </div>
  )

  const lado = (
    <section aria-label="Hoy" className="flex min-w-0 flex-col gap-2.5">
      <CajaDeHoy puntoId={punto.id} />
      <p className="m-0 text-[15px] text-tinta-suave">
        Aquí solo se aceptan bonos con destino: el cliente no recibe efectivo. El bono paga hasta su valor y el resto lo paga el cliente por fuera de Tatú.
      </p>
    </section>
  )

  if (computador) {
    return (
      <PantallaPuntoEscritorio volver={<VolverEscritorio a="/">Elegir rol</VolverEscritorio>} subtitulo={`${punto.nombre} · Comercio`} titulo="Venta con bono">
        <div className="grid grid-cols-2 items-start gap-10">
          {formulario}
          {lado}
        </div>
      </PantallaPuntoEscritorio>
    )
  }
  return (
    <PantallaCelular className="gap-4">
      <div className="flex items-center gap-2.5">
        <CuadroVolver a="/" etiqueta="Volver a elegir rol" />
        <Marca />
      </div>
      <div className="-mt-1.5 text-[15px] text-tinta-suave">{punto.nombre} · Comercio</div>
      <h1 className="m-0 text-2xl font-extrabold">Venta con bono</h1>
      {lado}
      {formulario}
    </PantallaCelular>
  )
}
