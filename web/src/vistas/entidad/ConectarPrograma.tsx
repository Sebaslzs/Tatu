// «Conecta tu subsidio» (HU-01 a HU-03): crear o editar el borrador, resolver la wallet, calcular el
// total de la liquidación (será el tope) y registrar puntos de retiro. Nada de esto mueve dinero.
import { Check, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { useConfig } from '@/api/config'
import { useEntidades } from '@/api/entidades'
import { ErrorHttp, http, mensajeDeError } from '@/api/http'
import type { BilleteraResuelta, Liquidacion, Programa, ProgramaEntrada, Punto } from '@/api/tipos'
import { BilleteraCorta, Boton, Campo, Cargando, ErrorCarga, MensajeError, Pastilla, Tarjeta, Titulo } from '@/componentes/Comun'
import { MarcoEntidad } from '@/componentes/MarcoEntidad'
import { PasosPrograma } from '@/componentes/PasosPrograma'
import { Celda, Encabezado, Fila, Tabla } from '@/componentes/Tabla'
import { aPesos, textoMonto } from '@/lib/montos'
import { rutaDelPrograma } from '@/lib/pantallas'
import { diaEnBogota, hoyEnBogota } from '@/lib/textos'
import { cn } from '@/lib/utils'
import { FormularioPersona } from './FormularioPersona'

type EstadoBilletera =
  | { estado: 'vacia' }
  | { estado: 'buscando' }
  | { estado: 'encontrada'; billetera: BilleteraResuelta }
  | { estado: 'noEncontrada'; mensaje: string }

async function resolver(direccion: string): Promise<EstadoBilletera> {
  try {
    const billetera = await http.get<BilleteraResuelta>(`/billeteras/resolver?direccion=${encodeURIComponent(direccion.trim())}`)
    return { estado: 'encontrada', billetera }
  } catch (e) {
    return { estado: 'noEncontrada', mensaje: e instanceof ErrorHttp && e.status === 404 ? 'No encontramos esa cuenta' : mensajeDeError(e) }
  }
}

function formInicial(): ProgramaEntrada {
  const hoy = hoyEnBogota()
  return { entidadId: '', nombre: '', tipo: 'subsidio', billetera: '', vigenciaInicio: hoy, vigenciaFin: `${hoy.slice(0, 4)}-12-31`, montoPorPersona: '', categorias: [] }
}

const MONTO_VALIDO = /^\d+(\.\d+)?$/

export default function ConectarPrograma() {
  const { id } = useParams()
  const navegar = useNavigate()
  const config = useConfig()
  const entidades = useEntidades()

  const [cargado, setCargado] = useState(!id)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [redirigir, setRedirigir] = useState<string | null>(null)
  const [form, setForm] = useState<ProgramaEntrada>(formInicial)
  const [textoCategorias, setTextoCategorias] = useState('')
  const [billetera, setBilletera] = useState<EstadoBilletera>({ estado: 'vacia' })
  const [liquidacion, setLiquidacion] = useState<Liquidacion | null>(null)
  const [puntos, setPuntos] = useState<Punto[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // Con una sola entidad, queda elegida
  const entidadId = form.entidadId || (!id && entidades?.length === 1 ? entidades[0]!.id : '')

  // Al editar se carga el borrador; cualquier otro estado tiene su propia pantalla
  useEffect(() => {
    let vivo = true
    void http
      .get<Punto[]>('/puntos')
      .then((p) => vivo && setPuntos(p.filter((x) => x.tipo === 'retiro')))
      .catch(() => undefined)
    if (!id) return
    ;(async () => {
      try {
        const p = await http.get<Programa>(`/programas/${id}`)
        if (!vivo) return
        if (p.estado !== 'Borrador') return setRedirigir(rutaDelPrograma(p.id, p.estado))
        setForm({
          entidadId: p.entidadId,
          nombre: p.nombre,
          tipo: p.tipo,
          billetera: p.billetera,
          vigenciaInicio: diaEnBogota(p.vigenciaInicio),
          vigenciaFin: diaEnBogota(p.vigenciaFin),
          montoPorPersona: p.montoPorPersona ? aPesos(p.montoPorPersona.valor, p.montoPorPersona.assetScale) : '',
          categorias: p.categorias,
        })
        setTextoCategorias(p.categorias.join(', '))
        setBilletera({ estado: 'encontrada', billetera: { id: p.billetera, nombre: null, moneda: { codigo: p.moneda.assetCode, escala: p.moneda.assetScale } } })
        const l = await http.get<Liquidacion>(`/programas/${id}/liquidacion`).catch(() => null)
        if (vivo) setLiquidacion(l)
      } catch (e) {
        if (vivo) setErrorCarga(mensajeDeError(e))
      } finally {
        if (vivo) setCargado(true)
      }
    })()
    return () => {
      vivo = false
    }
  }, [id])

  const cambiar = <K extends keyof ProgramaEntrada>(k: K, v: ProgramaEntrada[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setAviso(null)
    setError(null)
  }

  const validarBilletera = async () => {
    if (!form.billetera.trim()) return setBilletera({ estado: 'vacia' })
    setBilletera({ estado: 'buscando' })
    setBilletera(await resolver(form.billetera))
  }

  const categorias = textoCategorias
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean)

  const problema = (): string | null => {
    if (!entidadId) return 'Elige la entidad que financia el programa.'
    if (form.nombre.trim().length < 3) return 'Escribe el nombre del programa (al menos 3 letras).'
    if (!form.vigenciaInicio || !form.vigenciaFin) return 'Escribe las fechas de la vigencia.'
    if (form.vigenciaFin < form.vigenciaInicio) return 'La vigencia termina antes de empezar.'
    if (billetera.estado !== 'encontrada') return 'Escribe la wallet del programa y espera a que aparezca «Cuenta encontrada».'
    const monto = form.montoPorPersona?.trim() ?? ''
    if (!MONTO_VALIDO.test(monto) || !/[1-9]/.test(monto)) return 'Escribe el monto por persona en pesos, sin puntos de miles (por ejemplo, 10000).'
    return null
  }

  /** Crea o actualiza el borrador y devuelve su id. */
  const guardar = async (): Promise<string | null> => {
    const p = problema()
    if (p) {
      setError(p)
      return null
    }
    setError(null)
    setGuardando(true)
    const cuerpo: ProgramaEntrada = { ...form, entidadId, nombre: form.nombre.trim(), categorias: form.tipo === 'bono' ? categorias : [] }
    try {
      const programa = id ? await http.patch<Programa>(`/programas/${id}`, cuerpo) : await http.post<Programa>('/programas', cuerpo)
      return programa.id
    } catch (e) {
      setError(mensajeDeError(e))
      return null
    } finally {
      setGuardando(false)
    }
  }

  const calcularTotal = async () => {
    const programaId = await guardar()
    if (!programaId) return
    try {
      setLiquidacion(await http.get<Liquidacion>(`/programas/${programaId}/liquidacion`))
      if (!id) navegar(`/entidad/programas/${programaId}/editar`, { replace: true })
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  const guardarBorrador = async () => {
    const programaId = await guardar()
    if (!programaId) return
    setAviso('Borrador guardado. Todavía no se mueve dinero.')
    if (!id) navegar(`/entidad/programas/${programaId}/editar`, { replace: true })
  }

  const guardarYSeguir = async () => {
    if (!liquidacion) return setError('Calcula el total de las personas registradas: será el tope del permiso.')
    if (liquidacion.cedulas === 0) return setError('Todavía no hay personas registradas. Agrégalas y vuelve a calcular.')
    if (form.tipo === 'bono' && categorias.length === 0) return setError('Elige al menos una categoría de comercio que acepte el bono.')
    const programaId = await guardar()
    if (programaId) navegar(`/entidad/programas/${programaId}/aprobar`)
  }

  if (redirigir) return <Navigate to={redirigir} replace />

  const moneda = billetera.estado === 'encontrada' ? billetera.billetera.moneda : null

  return (
    <MarcoEntidad entidadId={entidadId || undefined}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-tenue">{id ? 'Borrador' : 'Nuevo programa'}</span>
          <Titulo>Conecta tu subsidio</Titulo>
        </div>
        <PasosPrograma estado="Borrador" />
      </div>

      {errorCarga && <ErrorCarga mensaje={errorCarga} reintentar={() => location.reload()} />}
      {!cargado && <Cargando />}

      {cargado && !errorCarga && (
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
            <Tarjeta>
              <h2 className="m-0 text-xl font-bold">1. Datos del programa</h2>
              <div className="flex flex-wrap gap-4">
                <Campo className="flex-[1_1_260px]" etiqueta="Nombre del programa" value={form.nombre} onChange={(e) => cambiar('nombre', e.target.value)} />
                <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5">
                  <label htmlFor="entidad" className="text-sm font-bold">
                    Entidad
                  </label>
                  <select
                    id="entidad"
                    value={entidadId}
                    onChange={(e) => cambiar('entidadId', e.target.value)}
                    className="min-h-12 w-full rounded-lg border-2 border-borde-campo bg-papel px-3 font-sans text-base text-foreground"
                  >
                    <option value="">{entidades === null ? 'Cargando…' : entidades.length ? 'Elige la entidad' : 'No hay entidades registradas'}</option>
                    {entidades?.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                <legend className="mb-2 p-0 text-sm font-bold">Tipo</legend>
                <div className="flex flex-wrap gap-3">
                  <label className={cn('flex flex-[1_1_240px] cursor-pointer items-start gap-2.5 rounded-[10px] px-3.5 py-3 text-[15px]', form.tipo === 'subsidio' ? 'border-2 border-foreground' : 'border border-control')}>
                    <input type="radio" name="tipo" value="subsidio" checked={form.tipo === 'subsidio'} onChange={() => cambiar('tipo', 'subsidio')} className="mt-0.5 size-5 accent-azul" />
                    <span className="flex flex-col gap-0.5">
                      <strong>Subsidio</strong>
                      <span className="text-tinta-suave">Destino libre: a la cuenta o retiro en un punto</span>
                    </span>
                  </label>
                  <label
                    className={cn(
                      'flex flex-[1_1_240px] items-start gap-2.5 rounded-[10px] px-3.5 py-3 text-[15px]',
                      config.extras.bono ? (form.tipo === 'bono' ? 'cursor-pointer border-2 border-foreground' : 'cursor-pointer border border-control') : 'border border-dashed border-control text-tenue',
                    )}
                  >
                    <input type="radio" name="tipo" value="bono" checked={form.tipo === 'bono'} disabled={!config.extras.bono} onChange={() => cambiar('tipo', 'bono')} className="mt-0.5 size-5 accent-azul" />
                    <span className="flex flex-col gap-0.5">
                      <strong>Bono con destino</strong>
                      <span>Solo en comercios autorizados · extra{!config.extras.bono && ' (apagado)'}</span>
                    </span>
                  </label>
                </div>
              </fieldset>
              <div className="flex flex-wrap gap-4">
                <Campo className="flex-[1_1_200px]" etiqueta="Vigencia: inicio" type="date" value={form.vigenciaInicio} onChange={(e) => cambiar('vigenciaInicio', e.target.value)} />
                <Campo className="flex-[1_1_200px]" etiqueta="Vigencia: fin" type="date" value={form.vigenciaFin} min={form.vigenciaInicio} onChange={(e) => cambiar('vigenciaFin', e.target.value)} />
              </div>
            </Tarjeta>

            <Tarjeta className="gap-3">
              <h2 className="m-0 text-xl font-bold">2. Cuenta del programa</h2>
              <Campo
                etiqueta="Dirección de la wallet del programa"
                mono
                placeholder="$ilp.interledger-test.dev/…"
                value={form.billetera}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => {
                  cambiar('billetera', e.target.value)
                  setBilletera({ estado: 'vacia' })
                }}
                onBlur={() => void validarBilletera()}
                ayuda="La wallet de quien paga, con saldo de prueba. Si empieza con $ la convertimos a https://."
              />
              <div aria-live="polite">
                {billetera.estado === 'buscando' && <p className="m-0 text-sm text-tinta-suave">Buscando la cuenta…</p>}
                {billetera.estado === 'encontrada' && (
                  <div className="flex flex-wrap items-center gap-2.5 rounded-lg bg-nota px-3 py-2.5 text-sm">
                    <Check aria-hidden className="size-[18px] text-pagado" strokeWidth={2.5} />
                    <span className="font-bold">Cuenta encontrada</span>
                    <BilleteraCorta url={billetera.billetera.id} completa className="text-tinta-suave" />
                    <Pastilla className="ml-auto">
                      Moneda: {billetera.billetera.moneda.codigo} · escala {billetera.billetera.moneda.escala}
                    </Pastilla>
                  </div>
                )}
                {billetera.estado === 'noEncontrada' && <MensajeError>{billetera.mensaje}</MensajeError>}
              </div>
            </Tarjeta>

            <Tarjeta className="gap-3.5">
              <h2 className="m-0 text-xl font-bold">{form.tipo === 'bono' ? '3. Personas y valor del bono' : '3. Personas y monto'}</h2>
              <p className="m-0 text-[15px] text-tinta-suave">
                Cada persona registrada recibe este monto en su wallet. Regístralas antes de aprobar: quien llegue después queda por fuera del tope y el banco puede rechazar su cobro.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <Campo
                  className="flex-[1_1_200px]"
                  etiqueta={`${form.tipo === 'bono' ? 'Valor del bono por persona' : 'Monto por persona'}${moneda ? ` (${moneda.codigo})` : ''}`}
                  inputMode="decimal"
                  placeholder="10000"
                  value={form.montoPorPersona ?? ''}
                  onChange={(e) => {
                    cambiar('montoPorPersona', e.target.value.replace(/[^\d.]/g, ''))
                    // Otro monto da otro total: hay que volver a calcularlo antes de aprobar
                    setLiquidacion(null)
                  }}
                  ayuda="En pesos, sin puntos de miles."
                />
                <Boton variante="contorno" className="mb-7" onClick={() => void calcularTotal()} disabled={guardando}>
                  {liquidacion ? 'Volver a calcular' : 'Calcular total'}
                </Boton>
              </div>
              <div className="flex flex-wrap gap-3" aria-live="polite">
                <div className="flex flex-[1_1_180px] flex-col gap-0.5 rounded-[10px] border border-linea px-4 py-3.5">
                  <span className="text-sm text-tenue">Personas registradas</span>
                  <span className="text-[28px] font-bold">{liquidacion ? liquidacion.cedulas : '—'}</span>
                </div>
                <div className="flex flex-[1_1_180px] flex-col gap-0.5 rounded-[10px] border border-linea px-4 py-3.5">
                  <span className="text-sm text-tenue">Total a pagar</span>
                  <span className="text-[28px] font-bold">{textoMonto(liquidacion?.total)}</span>
                </div>
                <div className="flex flex-[2_1_260px] items-center rounded-[10px] border border-dashed border-control px-4 py-3.5 text-[15px] text-tinta-suave">
                  Este total será el tope del permiso que apruebas en tu banco.
                </div>
              </div>
              <details className="rounded-[10px] border border-linea px-4 py-3">
                <summary className="min-h-11 cursor-pointer content-center font-bold text-enlace">Registrar personas</summary>
                <div className="pt-3">
                  <FormularioPersona alRegistrar={() => setLiquidacion(null)} />
                </div>
              </details>
            </Tarjeta>

            {form.tipo === 'bono' ? (
              <Tarjeta className="gap-3.5">
                <h2 className="m-0 text-xl font-bold">4. Dónde se usa el bono</h2>
                <p className="m-0 text-[15px] text-tinta-suave">El bono no se cobra en efectivo ni a la cuenta: lo aceptan las sedes de comercios cuya actividad está en las categorías que elijas.</p>
                <Campo
                  etiqueta="Categorías de comercio"
                  placeholder="alimentos, salud"
                  value={textoCategorias}
                  onChange={(e) => {
                    setTextoCategorias(e.target.value)
                    setError(null)
                  }}
                  ayuda="Separadas por coma. Máximo 10."
                />
              </Tarjeta>
            ) : (
              <SeccionPuntos programaId={id ?? null} moneda={moneda} puntos={puntos} alAgregar={(p) => setPuntos((l) => [...l, p])} />
            )}
          </div>

          <Tarjeta as="aside" className="flex-[1_1_300px]" aria-labelledby="titulo-resumen">
            <h2 id="titulo-resumen" className="m-0 text-xl font-bold">
              Resumen
            </h2>
            <Pastilla>Borrador</Pastilla>
            <p className="m-0 text-[15px] text-tinta-suave">Todavía no se mueve dinero.</p>
            <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-2.5 text-[15px]">
              <dt className="text-tenue">Tope del permiso</dt>
              <dd className="m-0 text-right font-bold">{textoMonto(liquidacion?.total)}</dd>
              <dt className="text-tenue">Personas</dt>
              <dd className="m-0 text-right">{liquidacion?.cedulas ?? '—'}</dd>
              <dt className="text-tenue">Canales</dt>
              <dd className="m-0 text-right">{form.tipo === 'bono' ? 'Compra en comercios' : 'Cuenta y punto'}</dd>
              <dt className="text-tenue">{form.tipo === 'bono' ? 'Categorías' : 'Puntos'}</dt>
              <dd className="m-0 text-right">{form.tipo === 'bono' ? categorias.length : puntos.length}</dd>
            </dl>
            <MensajeError>{error}</MensajeError>
            {aviso && (
              <p role="status" className="m-0 text-[15px] font-bold text-pagado">
                {aviso}
              </p>
            )}
            <Boton tamano="grande" onClick={() => void guardarYSeguir()} disabled={guardando}>
              Guardar y seguir
            </Boton>
            <Boton variante="contorno" onClick={() => void guardarBorrador()} disabled={guardando}>
              Guardar borrador
            </Boton>
          </Tarjeta>
        </div>
      )}
    </MarcoEntidad>
  )
}

function SeccionPuntos({
  programaId,
  moneda,
  puntos,
  alAgregar,
}: {
  programaId: string | null
  moneda: BilleteraResuelta['moneda'] | null
  puntos: Punto[]
  alAgregar: (p: Punto) => void
}) {
  const [nuevo, setNuevo] = useState({ nombre: '', direccion: '', billetera: '' })
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const agregar = async () => {
    setOk(null)
    if (nuevo.nombre.trim().length < 3 || !nuevo.billetera.trim()) return setError('Escribe el nombre (al menos 3 letras) y la wallet del punto.')
    setEnviando(true)
    setError(null)
    try {
      // HU-03: la moneda del punto tiene que ser la del programa. La API también lo revisa.
      const w = await resolver(nuevo.billetera)
      if (w.estado !== 'encontrada') return setError(w.estado === 'noEncontrada' ? w.mensaje : 'No encontramos esa cuenta')
      if (moneda && w.billetera.moneda.codigo !== moneda.codigo) {
        return setError(`La wallet del punto usa ${w.billetera.moneda.codigo} y el programa usa ${moneda.codigo}: no se guardó.`)
      }
      const p = await http.post<Punto>('/puntos', {
        nombre: nuevo.nombre.trim(),
        direccion: nuevo.direccion.trim() || undefined,
        billetera: nuevo.billetera.trim(),
        programaId: programaId ?? undefined,
      })
      alAgregar(p)
      setNuevo({ nombre: '', direccion: '', billetera: '' })
      setOk(`Agregamos «${p.nombre}».`)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Tarjeta className="gap-3.5">
      <h2 className="m-0 text-xl font-bold">4. Puntos de retiro</h2>
      <div className="rounded-lg border border-linea max-md:px-3">
        <Tabla apilada className="text-sm md:min-w-[620px]">
          <thead className="bg-nota">
            <Fila>
              <Encabezado className="px-3">Nombre</Encabezado>
              <Encabezado className="px-3">Dirección</Encabezado>
              <Encabezado className="px-3">Wallet</Encabezado>
              <Encabezado className="px-3">Moneda</Encabezado>
            </Fila>
          </thead>
          <tbody>
            {puntos.length === 0 && (
              <Fila>
                <Celda colSpan={4} className="px-3 text-tenue">
                  Todavía no hay puntos.
                </Celda>
              </Fila>
            )}
            {puntos.map((p) => (
              <Fila key={p.id}>
                <Celda titulo className="px-3 font-bold">
                  {p.nombre}
                </Celda>
                <Celda etiqueta="Dirección" className="px-3 text-tinta-suave">
                  {p.direccion || '—'}
                </Celda>
                <Celda etiqueta="Wallet" className="px-3">
                  <BilleteraCorta url={p.billetera} completa className="text-[13px]" />
                </Celda>
                <Celda etiqueta="Moneda" className="px-3">
                  {!p.moneda || !moneda ? (p.moneda?.assetCode ?? '—') : p.moneda.assetCode === moneda.codigo ? 'Igual al programa' : (
                    <span className="inline-flex items-center gap-1 font-bold text-rechazo">
                      <TriangleAlert aria-hidden className="size-4" /> {p.moneda.assetCode}: distinta
                    </span>
                  )}
                </Celda>
              </Fila>
            ))}
          </tbody>
        </Tabla>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Campo className="flex-[1_1_160px]" etiqueta="Nombre" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
        <Campo className="flex-[1_1_160px]" etiqueta="Dirección (opcional)" value={nuevo.direccion} onChange={(e) => setNuevo({ ...nuevo, direccion: e.target.value })} />
        <Campo
          className="flex-[2_1_220px]"
          etiqueta="Wallet del punto"
          mono
          placeholder="$ilp.interledger-test.dev/…"
          spellCheck={false}
          value={nuevo.billetera}
          onChange={(e) => setNuevo({ ...nuevo, billetera: e.target.value })}
        />
        <Boton variante="contorno" onClick={() => void agregar()} disabled={enviando}>
          Agregar punto
        </Boton>
      </div>
      <MensajeError>{error}</MensajeError>
      {ok && (
        <p role="status" className="m-0 text-[15px] font-bold text-pagado">
          {ok}
        </p>
      )}
      <p className="m-0 text-sm text-tenue">La wallet del punto debe usar la misma moneda del programa; si no, no se guarda.</p>
    </Tarjeta>
  )
}
