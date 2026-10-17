// Lista de personas que sube la entidad (Excel o CSV): lectura del CSV y revisión fila por fila antes
// de registrarlas con POST /beneficiarios. Una fila por persona; la primera fila son los encabezados.
import type { CobraCon } from '@/api/tipos'

export interface PersonaDeLaLista {
  /** Número de fila en el archivo, contando el encabezado como la 1. */
  fila: number
  cedula: string
  nombre?: string
  billetera: string
  pin?: string
  cobraCon: CobraCon
}

export interface ProblemaDeFila {
  fila: number
  problema: string
}

export interface RevisionLista {
  /** Filas con algún dato (sin contar el encabezado ni las vacías). */
  leidas: number
  listas: PersonaDeLaLista[]
  problemas: ProblemaDeFila[]
}

export const MAX_FILAS = 1000

export const COLUMNAS_PLANTILLA = ['cedula', 'nombre', 'wallet', 'pin', 'cobra_con'] as const

export const PLANTILLA_CSV = [
  COLUMNAS_PLANTILLA.join(','),
  '1000000101,Nombre de ejemplo,$ilp.interledger-test.dev/escribe-aqui-su-wallet,1234,wallet',
  '1000000102,Otro ejemplo,$ilp.interledger-test.dev/escribe-aqui-su-wallet-2,,llave',
].join('\r\n')

type Columna = (typeof COLUMNAS_PLANTILLA)[number]

/** Nombres que se aceptan en el encabezado para cada columna. */
const SINONIMOS: Record<Columna, string[]> = {
  cedula: ['cedula', 'documento', 'numero de documento', 'cc'],
  nombre: ['nombre', 'nombre completo'],
  wallet: ['wallet', 'billetera', 'wallet address', 'direccion de la wallet'],
  pin: ['pin'],
  cobra_con: ['cobra con', 'cobracon', 'canal'],
}

function limpiarEncabezado(texto: unknown): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Una celda como texto. Excel puede guardar la cédula como número: se escribe sin decimales. */
function texto(celda: unknown): string {
  if (celda === null || celda === undefined) return ''
  if (typeof celda === 'number') return Number.isInteger(celda) ? celda.toFixed(0) : String(celda)
  return String(celda).trim()
}

/** Separa una línea de CSV respetando comillas; el separador es «,» o «;» (Excel en español usa «;»). */
function celdasDeLinea(linea: string, separador: string): string[] {
  const celdas: string[] = []
  let actual = ''
  let entreComillas = false
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]
    if (c === '"') {
      if (entreComillas && linea[i + 1] === '"') {
        actual += '"'
        i++
      } else {
        entreComillas = !entreComillas
      }
    } else if (c === separador && !entreComillas) {
      celdas.push(actual)
      actual = ''
    } else {
      actual += c
    }
  }
  celdas.push(actual)
  return celdas
}

export function leerCsv(contenido: string): string[][] {
  const lineas = contenido.replace(/^﻿/, '').split(/\r?\n/)
  const primera = lineas.find((l) => l.trim() !== '') ?? ''
  const separador = (primera.match(/;/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? ';' : ','
  return lineas.filter((l) => l.trim() !== '').map((l) => celdasDeLinea(l, separador))
}

function cobraConDe(valor: string): CobraCon | null {
  const v = limpiarEncabezado(valor)
  if (v === '' || v === 'wallet' || v === 'billetera') return 'wallet'
  if (v === 'llave' || v === 'llave bre b' || v === 'bre b' || v === 'breb' || v === 'cedula' || v === 'llave cedula') return 'llaveCedula'
  return null
}

/**
 * Revisa las filas: cédula de 5 a 12 dígitos, wallet presente, PIN de 4 dígitos si viene, «cobra_con»
 * wallet o llave, y sin cédulas repetidas en el archivo. Lanza un Error si falta un encabezado.
 */
export function revisarLista(filas: readonly (readonly unknown[])[]): RevisionLista {
  const [encabezado, ...resto] = filas
  if (!encabezado) throw new Error('El archivo está vacío.')
  const nombres = encabezado.map(limpiarEncabezado)
  const indice = Object.fromEntries(
    COLUMNAS_PLANTILLA.map((c) => [c, nombres.findIndex((n) => SINONIMOS[c].includes(n))]),
  ) as Record<Columna, number>
  const faltan = (['cedula', 'wallet'] as const).filter((c) => indice[c] < 0)
  if (faltan.length) throw new Error(`Faltan las columnas ${faltan.join(' y ')}. Descarga la plantilla y usa sus encabezados.`)

  const celda = (fila: readonly unknown[], c: Columna) => (indice[c] < 0 ? '' : texto(fila[indice[c]]))
  const conDatos = resto.map((f, i) => ({ f, numero: i + 2 })).filter(({ f }) => f.some((c) => texto(c) !== ''))
  if (conDatos.length === 0) throw new Error('El archivo no trae personas: solo el encabezado.')
  if (conDatos.length > MAX_FILAS) throw new Error(`El archivo trae ${conDatos.length} personas; el máximo es ${MAX_FILAS}.`)

  const listas: PersonaDeLaLista[] = []
  const problemas: ProblemaDeFila[] = []
  const vistas = new Map<string, number>()

  for (const { f, numero } of conDatos) {
    const cedula = celda(f, 'cedula').replace(/[\s.]/g, '')
    const billetera = celda(f, 'wallet')
    const pin = celda(f, 'pin')
    const cobraCon = cobraConDe(celda(f, 'cobra_con'))
    const nombre = celda(f, 'nombre').replace(/\s+/g, ' ')
    const mal = (problema: string) => problemas.push({ fila: numero, problema })

    if (!/^\d{5,12}$/.test(cedula)) mal(`Cédula «${cedula || 'vacía'}»: van de 5 a 12 números, sin puntos.`)
    else if (vistas.has(cedula)) mal(`La cédula ${cedula} ya está en la fila ${vistas.get(cedula)}.`)
    else if (!billetera) mal(`Falta la wallet de la cédula ${cedula}.`)
    else if (pin && !/^\d{4}$/.test(pin)) mal(`El PIN de la cédula ${cedula} debe tener 4 números.`)
    else if (!cobraCon) mal(`«cobra_con» de la cédula ${cedula} debe ser wallet o llave.`)
    else if (nombre.length > 80) mal(`El nombre de la cédula ${cedula} pasa de 80 letras.`)
    else {
      vistas.set(cedula, numero)
      listas.push({ fila: numero, cedula, billetera, cobraCon, ...(nombre ? { nombre } : {}), ...(pin ? { pin } : {}) })
    }
  }
  return { leidas: conDatos.length, listas, problemas }
}
