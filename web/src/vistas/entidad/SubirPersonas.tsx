// Registrar muchas personas de una vez desde un Excel (.xlsx) o un CSV: se lee el archivo en el
// navegador, se revisa fila por fila y las que están bien se registran una por una con
// POST /beneficiarios. Quien ya estaba registrado se cuenta aparte, no como error.
import { Download, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { ErrorHttp, http, mensajeDeError } from '@/api/http'
import type { BeneficiarioEntrada } from '@/api/tipos'
import { Boton, MensajeError } from '@/componentes/Comun'
import { Celda, Encabezado, Fila, FilaEncabezado, Tabla } from '@/componentes/Tabla'
import { leerCsv, MAX_FILAS, PLANTILLA_CSV, revisarLista, type PersonaDeLaLista, type RevisionLista } from '@/lib/cargaPersonas'

interface Resultado {
  agregadas: number
  yaEstaban: number
  fallidas: { cedula: string; mensaje: string }[]
}

async function leerArchivo(archivo: File): Promise<unknown[][]> {
  if (/\.xlsx$/i.test(archivo.name)) {
    const { readSheet } = await import('read-excel-file/browser')
    return readSheet(archivo)
  }
  if (/\.csv$/i.test(archivo.name)) return leerCsv(await archivo.text())
  throw new Error('Sube un archivo de Excel (.xlsx) o un .csv. Si es .xls, guárdalo como .xlsx.')
}

function descargarPlantilla() {
  // El BOM hace que Excel abra las tildes bien
  const url = URL.createObjectURL(new Blob(['﻿' + PLANTILLA_CSV], { type: 'text/csv;charset=utf-8' }))
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = 'plantilla-personas.csv'
  enlace.click()
  URL.revokeObjectURL(url)
}

const plural = (n: number, una: string, varias: string) => `${n} ${n === 1 ? una : varias}`

export function SubirPersonas({ alTerminar }: { alTerminar: () => void }) {
  const entrada = useRef<HTMLInputElement>(null)
  const [archivo, setArchivo] = useState<string | null>(null)
  const [revision, setRevision] = useState<RevisionLista | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [avance, setAvance] = useState<number | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)

  const elegir = async (f: File | undefined) => {
    setRevision(null)
    setResultado(null)
    setError(null)
    if (!f) return
    setArchivo(f.name)
    setLeyendo(true)
    try {
      setRevision(revisarLista(await leerArchivo(f)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos leer el archivo.')
    } finally {
      setLeyendo(false)
      // Así se puede volver a elegir el mismo archivo después de corregirlo
      if (entrada.current) entrada.current.value = ''
    }
  }

  const agregar = async (listas: PersonaDeLaLista[]) => {
    const r: Resultado = { agregadas: 0, yaEstaban: 0, fallidas: [] }
    for (const [i, p] of listas.entries()) {
      setAvance(i + 1)
      const cuerpo: BeneficiarioEntrada = { cedula: p.cedula, billetera: p.billetera, nombre: p.nombre, pin: p.pin, cobraCon: p.cobraCon }
      try {
        await http.post('/beneficiarios', cuerpo)
        r.agregadas++
      } catch (e) {
        if (e instanceof ErrorHttp && e.codigo === 'PersonaExiste') r.yaEstaban++
        else r.fallidas.push({ cedula: p.cedula, mensaje: mensajeDeError(e) })
      }
    }
    setAvance(null)
    setResultado(r)
    setRevision(null)
    alTerminar()
  }

  const ocupado = leyendo || avance !== null

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[15px] text-tinta-suave">
        Una fila por persona con <b>cedula</b> y <b>wallet</b>; <b>nombre</b>, <b>pin</b> y <b>cobra_con</b> (wallet o llave) son opcionales.
        Excel (.xlsx) o .csv, hasta {MAX_FILAS.toLocaleString('es-CO')} personas.
      </p>
      <div className="flex flex-wrap gap-3">
        <Boton variante="contorno" onClick={descargarPlantilla}>
          <Download aria-hidden className="size-4" />
          Descargar plantilla
        </Boton>
        <Boton variante="contorno" onClick={() => entrada.current?.click()} disabled={ocupado}>
          <Upload aria-hidden className="size-4" />
          {archivo ? 'Elegir otro archivo' : 'Elegir archivo'}
        </Boton>
        <input
          ref={entrada}
          type="file"
          accept=".xlsx,.csv"
          className="sr-only"
          aria-label="Archivo con las personas"
          onChange={(e) => void elegir(e.target.files?.[0])}
        />
      </div>

      <div aria-live="polite" className="flex flex-col gap-3">
        {leyendo && <p className="m-0 text-sm text-tinta-suave">Leyendo {archivo}…</p>}
        <MensajeError>{error}</MensajeError>

        {revision && (
          <>
            <p className="m-0 text-[15px]">
              <b>{archivo}</b>: {plural(revision.leidas, 'fila', 'filas')} ·{' '}
              <b className="text-pagado">{plural(revision.listas.length, 'lista', 'listas')}</b> ·{' '}
              <b className={revision.problemas.length ? 'text-rechazo' : undefined}>{revision.problemas.length} con problemas</b>
            </p>
            {revision.problemas.length > 0 && (
              <ul className="m-0 flex flex-col gap-1 pl-5 text-sm">
                {revision.problemas.map((p) => (
                  <li key={p.fila}>
                    <b>Fila {p.fila}:</b> {p.problema}
                  </li>
                ))}
              </ul>
            )}
            {revision.listas.length > 0 && (
              <div className="max-h-72 overflow-y-auto rounded-lg border border-linea max-md:px-3">
                <Tabla apilada className="text-sm md:min-w-[560px]">
                  <thead className="bg-nota">
                    <FilaEncabezado>
                      <Encabezado className="px-3">Cédula</Encabezado>
                      <Encabezado className="px-3">Nombre</Encabezado>
                      <Encabezado className="px-3">Cobra con</Encabezado>
                      <Encabezado className="px-3">Wallet</Encabezado>
                    </FilaEncabezado>
                  </thead>
                  <tbody>
                    {revision.listas.map((p) => (
                      <Fila key={p.cedula}>
                        <Celda titulo className="px-3 font-bold">
                          {p.cedula}
                        </Celda>
                        <Celda etiqueta="Nombre" className="px-3">
                          {p.nombre ?? '—'}
                        </Celda>
                        <Celda etiqueta="Cobra con" className="px-3">
                          {p.cobraCon === 'llaveCedula' ? 'Llave Bre-B' : 'Wallet'}
                        </Celda>
                        <Celda etiqueta="Wallet" className="mono px-3 text-[13px] break-all">
                          {p.billetera}
                        </Celda>
                      </Fila>
                    ))}
                  </tbody>
                </Tabla>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Boton onClick={() => void agregar(revision.listas)} disabled={ocupado || revision.listas.length === 0}>
                {avance !== null ? `Agregando ${avance} de ${revision.listas.length}…` : `Agregar ${plural(revision.listas.length, 'persona', 'personas')}`}
              </Boton>
              {revision.problemas.length > 0 && <span className="text-sm text-tenue">Las filas con problemas no se agregan: corrígelas y sube el archivo otra vez.</span>}
            </div>
          </>
        )}

        {resultado && (
          <div role="status" className="flex flex-col gap-1 text-[15px]">
            <p className="m-0 font-bold text-pagado">
              Agregamos {plural(resultado.agregadas, 'persona', 'personas')}
              {resultado.yaEstaban > 0 && ` · ${plural(resultado.yaEstaban, 'ya estaba registrada', 'ya estaban registradas')}`}.
            </p>
            {resultado.fallidas.length > 0 && (
              <>
                <p className="m-0 font-bold text-rechazo">
                  {resultado.fallidas.length === 1 ? 'No se agregó 1 persona:' : `No se agregaron ${resultado.fallidas.length} personas:`}
                </p>
                <ul className="m-0 flex flex-col gap-1 pl-5 text-sm">
                  {resultado.fallidas.map((f) => (
                    <li key={f.cedula}>
                      <b>{f.cedula}:</b> {f.mensaje}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
