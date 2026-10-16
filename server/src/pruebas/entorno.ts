// Entorno de pruebas de integración: la API real sobre PGlite en memoria (mismo esquema que
// Supabase), con billeteras y permisos falsos, la liquidación simulada por HTTP y un reloj
// controlado. Nunca toca Supabase.
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { sql } from 'drizzle-orm'
import { crearApp } from '../app.ts'
import { leerConfig } from '../config.ts'
import { crearContenedor, type Contenedor } from '../contenedor.ts'
import { abrirBase } from '../db/conexion.ts'
import type { FilaEntidad } from '../db/repositorios/entidades.ts'
import type { Repos } from '../db/unidadDeTrabajo.ts'
import { LiquidacionSimulada, type PersonaLiquidada } from '../liquidacion/simulador.ts'
import { candidatos } from '../programas/hash.ts'
import { PuenteSimulado } from '../puente/simulador.ts'
import { BilleterasFalsas } from './billeterasFalsas.ts'
import { PagosFalsos } from './pagosFalsos.ts'
import { PermisosFalsos, URL_AUTORIZACION } from './permisosFalsos.ts'

export interface Respuesta<T> {
  status: number
  cuerpo: T
  /** Cabecera `Location` de una redirección. */
  ubicacion: string | null
}

// En pruebas el cuerpo es JSON libre; cada test afirma la forma que espera
type Json = any

export interface OpcionesEntorno {
  /** Variables de entorno extra (p. ej. EXTRA_BONO). */
  entorno?: Record<string, string>
  /** Personas de la liquidación simulada; por defecto, las 3 de prueba ($690.000). */
  liquidacion?: readonly PersonaLiquidada[]
}

export const INICIO_DE_PRUEBA = new Date('2026-10-16T15:00:00.000Z')

// Orden de borrado: los hijos antes que los padres
const TABLAS = ['bloqueo_pin', 'cobro', 'cuenta_beneficiario', 'beneficiario', 'evento', 'programa_categoria', 'programa_punto', 'punto', 'programa', 'comercio', 'entidad']

export async function crearEntorno({ entorno = {}, liquidacion }: OpcionesEntorno = {}) {
  const base = await abrirBase({})
  const billeteras = new BilleterasFalsas()
  const permisos = new PermisosFalsos()
  const pagos = new PagosFalsos()
  const simulador = new LiquidacionSimulada(liquidacion)
  const puente = new PuenteSimulado()
  let ahora = INICIO_DE_PRUEBA

  const servidor = createServer()
  await new Promise<void>((listo) => servidor.listen(0, '127.0.0.1', listo))
  const url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api`

  const config = leerConfig({ LIQUIDACION_URL: `${url}/liquidacion`, PUENTE_URL: `${url}/puente`, API_BASE_URL: url, EXTRA_BONO: 'true', ...entorno })
  const contenedor: Contenedor = crearContenedor({
    db: base.db,
    config,
    billeteras,
    permisos,
    verificacion: permisos,
    pagos,
    simuladorLiquidacion: simulador,
    simuladorPuente: puente,
    reloj: () => ahora,
    nuevoNonce: () => 'nonce-cliente-de-prueba',
  })
  servidor.on('request', crearApp(contenedor))

  async function pedir<T = Json>(metodo: string, ruta: string, cuerpo?: unknown): Promise<Respuesta<T>> {
    const res = await fetch(`${url}${ruta}`, {
      method: metodo,
      headers: { 'content-type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      redirect: 'manual',
    })
    const texto = await res.text()
    // Una redirección responde texto; todo lo demás de la API es JSON
    const esJson = (res.headers.get('content-type') ?? '').includes('application/json')
    return { status: res.status, cuerpo: (esJson ? JSON.parse(texto) : texto) as T, ubicacion: res.headers.get('location') }
  }

  return {
    url,
    config,
    db: base.db,
    billeteras,
    permisos,
    pagos,
    simulador,
    puente,
    contenedor,
    /** Espera los pagos que el servidor dispara en segundo plano. */
    esperarPagos: () => contenedor.cobros.esperarPagos(),
    repos: contenedor.uow.repos as Repos,
    pedir,
    avanzarReloj(ms: number) {
      ahora = new Date(ahora.getTime() + ms)
    },
    get ahora() {
      return ahora
    },
    async contar(tabla: string): Promise<number> {
      // PGlite devuelve { rows }; el tipo genérico de Drizzle no lo sabe
      const r = (await base.db.execute(sql.raw(`SELECT count(*)::int AS n FROM public.${tabla}`))) as unknown as { rows: { n: number }[] }
      return r.rows[0]!.n
    },
    async limpiar() {
      await base.db.execute(sql.raw(`TRUNCATE ${TABLAS.map((t) => `public.${t}`).join(', ')} CASCADE`))
      billeteras.limpiar()
      permisos.reiniciar()
      pagos.reiniciar()
      simulador.reiniciar()
      puente.reiniciar()
      ahora = INICIO_DE_PRUEBA
    },
    crearEntidad(nombre = 'Alcaldía de Prueba'): Promise<FilaEntidad> {
      return contenedor.uow.repos.entidades.crear({ documento: `900${Math.floor(Math.random() * 1e6)}`, nombre, tipo: 'gobierno' })
    },
    /** El `hash` que mandaría la Test Wallet al volver de verificar esta cuenta. */
    async hashCuenta(cuentaId: string, interactRef: string): Promise<string> {
      const c = (await contenedor.uow.repos.cuentas.obtener(cuentaId))!
      return candidatos({
        nonceCliente: c.nonceCliente!,
        nonceCierre: c.nonceCierre!,
        interactRef,
        urlPermiso: URL_AUTORIZACION,
      })[0]!.valor
    },
    /** El `hash` que mandaría la Test Wallet al volver del consentimiento de este programa. */
    async hashValido(programaId: string, interactRef: string): Promise<string> {
      const p = (await contenedor.uow.repos.programas.obtener(programaId))!
      return candidatos({
        nonceCliente: p.nonceCliente!,
        nonceCierre: p.nonceCierre!,
        interactRef,
        urlPermiso: p.urlPermiso!,
      })[0]!.valor
    },
    async cerrar() {
      await new Promise((listo) => servidor.close(listo))
      await base.cerrar()
    },
  }
}

export type Entorno = Awaited<ReturnType<typeof crearEntorno>>
