// Registrar una persona en la liquidación (POST /beneficiarios): cédula y billetera; nombre y PIN
// opcionales. Cobra a su wallet o con su cédula como llave Bre-B (el banco puente simulado la lleva a
// esa misma billetera). Reemplaza al «Equipo de prueba» del piloto.
import { useState, type FormEvent } from 'react'
import { http, mensajeDeError } from '@/api/http'
import type { Beneficiario, BeneficiarioEntrada, CobraCon } from '@/api/tipos'
import { Boton, Campo, MensajeError } from '@/componentes/Comun'
import { cn } from '@/lib/utils'

const VACIO = { cedula: '', billetera: '', nombre: '', pin: '' }

const OPCIONES: { valor: CobraCon; titulo: string; detalle: string }[] = [
  { valor: 'wallet', titulo: 'Su wallet', detalle: 'El pago llega directo a la wallet' },
  { valor: 'llaveCedula', titulo: 'Llave Bre-B (su cédula)', detalle: 'Su banco recibe por la cédula y lo lleva a esa wallet' },
]

export function FormularioPersona({ alRegistrar }: { alRegistrar: (b: Beneficiario) => void }) {
  const [form, setForm] = useState(VACIO)
  const [cobraCon, setCobraCon] = useState<CobraCon>('wallet')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const cambiar = (k: keyof typeof VACIO, v: string) => {
    setForm((f) => ({ ...f, [k]: v }))
    setError(null)
    setOk(null)
  }

  const registrar = async (e: FormEvent) => {
    e.preventDefault()
    const cedula = form.cedula.replace(/[\s.]/g, '')
    if (!/^\d{5,12}$/.test(cedula)) return setError('La cédula son de 5 a 12 números, sin puntos.')
    if (!form.billetera.trim()) return setError('Escribe la wallet de la persona.')
    if (form.pin && !/^\d{4}$/.test(form.pin)) return setError('El PIN son 4 números.')
    const cuerpo: BeneficiarioEntrada = {
      cedula,
      billetera: form.billetera.trim(),
      nombre: form.nombre.trim() || undefined,
      pin: form.pin || undefined,
      cobraCon,
    }
    setEnviando(true)
    try {
      const b = await http.post<Beneficiario>('/beneficiarios', cuerpo)
      setForm(VACIO)
      setOk(cobraCon === 'llaveCedula' ? `Registramos a ${b.nombre} con su cédula como llave Bre-B.` : `Registramos a ${b.nombre}.`)
      alRegistrar(b)
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={(e) => void registrar(e)} noValidate className="flex flex-col gap-3">
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 p-0 text-sm font-bold">Cobra con</legend>
        <div className="flex flex-wrap gap-3">
          {OPCIONES.map((o) => (
            <label
              key={o.valor}
              className={cn(
                'flex flex-[1_1_220px] cursor-pointer items-start gap-2.5 rounded-[10px] px-3.5 py-2.5 text-[15px]',
                cobraCon === o.valor ? 'border-2 border-foreground' : 'border border-control',
              )}
            >
              <input
                type="radio"
                name="cobra-con"
                value={o.valor}
                checked={cobraCon === o.valor}
                onChange={() => {
                  setCobraCon(o.valor)
                  setOk(null)
                }}
                className="mt-0.5 size-5 accent-azul"
              />
              <span className="flex flex-col gap-0.5">
                <strong>{o.titulo}</strong>
                <span className="text-sm text-tinta-suave">{o.detalle}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-end gap-3">
        <Campo className="flex-[1_1_150px]" etiqueta="Cédula" inputMode="numeric" autoComplete="off" value={form.cedula} onChange={(e) => cambiar('cedula', e.target.value)} />
        <Campo className="flex-[1_1_180px]" etiqueta="Nombre (opcional)" value={form.nombre} onChange={(e) => cambiar('nombre', e.target.value)} />
        <Campo
          className="flex-[2_1_240px]"
          etiqueta={cobraCon === 'llaveCedula' ? 'Wallet a la que llega su llave' : 'Wallet de la persona'}
          mono
          placeholder="$ilp.interledger-test.dev/…"
          spellCheck={false}
          autoComplete="off"
          value={form.billetera}
          onChange={(e) => cambiar('billetera', e.target.value)}
        />
        <Campo
          className="flex-[0_1_110px]"
          etiqueta="PIN (opcional)"
          inputMode="numeric"
          maxLength={4}
          autoComplete="off"
          value={form.pin}
          onChange={(e) => cambiar('pin', e.target.value.replace(/\D/g, ''))}
        />
        <Boton type="submit" variante="contorno" disabled={enviando}>
          {enviando ? 'Registrando…' : 'Agregar persona'}
        </Boton>
      </div>
      <MensajeError>{error}</MensajeError>
      {ok && (
        <p role="status" className="m-0 text-[15px] font-bold text-pagado">
          {ok}
        </p>
      )}
      <p className="m-0 text-sm text-tenue">Sin PIN, la persona solo cobra a su cuenta; con PIN también puede retirar en un punto.</p>
    </form>
  )
}
