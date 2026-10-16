// Entorno de pruebas de integración: la API real sobre PGlite en memoria (mismo esquema que
// Supabase), con billeteras falsas, la liquidación simulada por HTTP y un reloj controlado.
// Nunca toca Supabase.
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { sql } from 'drizzle-orm'
import { crearApp } from '../app.ts'
import { leerConfig } from '../config.ts'
import { crearContenedor, type Contenedor } from '../contenedor.ts'
import { abrirBase } from '../db/conexion.ts'
import type { FilaEntidad } from '../db/repositorios/entidades.ts'
import type { Repos } from '../db/unidadDeTrabajo.ts'
import { LiquidacionSimulada } from '../liquidacion/simulador.ts'
import { BilleterasFalsas } from './billeterasFalsas.ts'

export interface Respuesta<T> {
  status: number
  cuerpo: T
}

// En pruebas el cuerpo es JSON libre; cada test afirma la forma que espera
type Json = any

export interface OpcionesEntorno {
  /** Variables de entorno extra (p. ej. EXTRA_BONO). */
  entorno?: Record<string, string>
}

export const INICIO_DE_PRUEBA = new Date('2026-10-16T15:00:00.000Z')

const TABLAS = ['evento', 'programa_categoria', 'programa_punto', 'punto', 'programa', 'entidad', 'beneficiario']

export async function crearEntorno({ entorno = {} }: OpcionesEntorno = {}) {
  const base = await abrirBase({})
  const billeteras = new BilleterasFalsas()
  const simulador = new LiquidacionSimulada()
  let ahora = INICIO_DE_PRUEBA

  const servidor = createServer()
  await new Promise<void>((listo) => servidor.listen(0, '127.0.0.1', listo))
  const url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api`

  const config = leerConfig({ LIQUIDACION_URL: `${url}/liquidacion`, EXTRA_BONO: 'true', ...entorno })
  const contenedor: Contenedor = crearContenedor({ db: base.db, config, billeteras, simuladorLiquidacion: simulador, reloj: () => ahora })
  servidor.on('request', crearApp(contenedor))

  async function pedir<T = Json>(metodo: string, ruta: string, cuerpo?: unknown): Promise<Respuesta<T>> {
    const res = await fetch(`${url}${ruta}`, {
      method: metodo,
      headers: { 'content-type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    })
    return { status: res.status, cuerpo: (await res.json()) as T }
  }

  return {
    url,
    db: base.db,
    billeteras,
    simulador,
    contenedor,
    repos: contenedor.uow.repos as Repos,
    pedir,
    avanzarReloj(ms: number) {
      ahora = new Date(ahora.getTime() + ms)
    },
    async contar(tabla: string): Promise<number> {
      // PGlite devuelve { rows }; el tipo genérico de Drizzle no lo sabe
      const r = (await base.db.execute(sql.raw(`SELECT count(*)::int AS n FROM public.${tabla}`))) as unknown as { rows: { n: number }[] }
      return r.rows[0]!.n
    },
    async limpiar() {
      await base.db.execute(sql.raw(`TRUNCATE ${TABLAS.map((t) => `public.${t}`).join(', ')} CASCADE`))
      billeteras.limpiar()
      ahora = INICIO_DE_PRUEBA
    },
    crearEntidad(nombre = 'Alcaldía de Prueba'): Promise<FilaEntidad> {
      return contenedor.uow.repos.entidades.crear({ documento: `900${Math.floor(Math.random() * 1e6)}`, nombre, tipo: 'gobierno' })
    },
    async cerrar() {
      await new Promise((listo) => servidor.close(listo))
      await base.cerrar()
    },
  }
}

export type Entorno = Awaited<ReturnType<typeof crearEntorno>>
