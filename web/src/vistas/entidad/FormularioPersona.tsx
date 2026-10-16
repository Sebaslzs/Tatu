// Registrar una persona en la liquidación (POST /beneficiarios): cédula y billetera; nombre y PIN
// opcionales. Reemplaza al «Equipo de prueba» del piloto.
import { useState, type FormEvent } from 'react'
import { http, mensajeDeError } from '@/api/http'
import type { Beneficiario, BeneficiarioEntrada } from '@/api/tipos'
import { Boton, Campo, MensajeError } from '@/componentes/Comun'

const VACIO = { cedula: '', billetera: '', nombre: '', pin: '' }

export function FormularioPersona({ alRegistrar }: { alRegistrar: (b: Beneficiario) => void }) {
  const [form, setForm] = useState(VACIO)
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
    }
    setEnviando(true)
    try {
      const b = await http.post<Beneficiario>('/beneficiarios', cuerpo)
      setForm(VACIO)
      setOk(`Registramos a ${b.nombre}.`)
      alRegistrar(b)
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={(e) => void registrar(e)} noValidate className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Campo className="flex-[1_1_150px]" etiqueta="Cédula" inputMode="numeric" autoComplete="off" value={form.cedula} onChange={(e) => cambiar('cedula', e.target.value)} />
        <Campo className="flex-[1_1_180px]" etiqueta="Nombre (opcional)" value={form.nombre} onChange={(e) => cambiar('nombre', e.target.value)} />
        <Campo
          className="flex-[2_1_240px]"
          etiqueta="Wallet de la persona"
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
