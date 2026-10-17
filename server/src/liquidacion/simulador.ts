// Liquidación simulada de la entidad (AD-13), en memoria: la usan las pruebas. La API sirve la que se
// guarda en la base (enBase.ts), que empieza vacía.
// Datos de prueba (Arquitectura § 4.1): 3 cédulas de $230.000 (COP, escala 2) = $690.000.
// El PIN nunca se guarda en claro: solo su hash, y solo se puede preguntar «¿es este?».
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { DatosLiquidacion, Pago, Persona, Resumen } from './contrato.ts'

export interface PersonaLiquidada {
  documento: string
  nombre: string
  /** Unidades mínimas (COP escala 2). */
  monto: number
  pin?: string
  /** Retroactivo cargado después de aprobar el permiso: el tope no lo incluye (CA-02.07). */
  novedad?: boolean
}

export const LIQUIDACION_DE_PRUEBA: readonly PersonaLiquidada[] = [
  { documento: '1000000001', nombre: 'Ana Pérez', monto: 23_000_000, pin: '1111' },
  { documento: '1000000002', nombre: 'Luis Gómez', monto: 23_000_000, pin: '2222' },
  { documento: '1000000003', nombre: 'Jorge Ruiz', monto: 23_000_000, pin: '3333' },
]

/** Monto de quien no tiene uno propio ni lo fija el programa ($230.000 con escala 2). */
export const MONTO_POR_DEFECTO = 23_000_000

// scrypt con costo bajo: el PIN tiene 4 dígitos, así que lo que protege de verdad es el límite de
// intentos que lleva la API. El hash solo evita guardar el PIN en claro.
const COSTO = { N: 1024, r: 8, p: 1 }

export function hashPin(pin: string): string {
  const sal = randomBytes(16)
  return `${sal.toString('hex')}:${scryptSync(pin, sal, 32, COSTO).toString('hex')}`
}

export function pinCoincide(guardado: string, pin: string): boolean {
  const [sal, hash] = guardado.split(':')
  if (!sal || !hash) return false
  const esperado = Buffer.from(hash, 'hex')
  return timingSafeEqual(esperado, scryptSync(pin, Buffer.from(sal, 'hex'), esperado.length, COSTO))
}

interface Registro {
  nombre: string
  monto: number
  novedad: boolean
  pinHash: string | null
}

export class LiquidacionSimulada implements DatosLiquidacion {
  private readonly inicial: readonly PersonaLiquidada[]
  private personas = new Map<string, Registro>()
  private pagadas = new Set<string>()

  constructor(personas: readonly PersonaLiquidada[] = LIQUIDACION_DE_PRUEBA) {
    this.inicial = personas
    this.reiniciar()
  }

  /** Vuelve a los datos con que se creó (lo usan las pruebas entre casos). */
  reiniciar(): void {
    this.personas = new Map(this.inicial.map((p) => [p.documento, this.registro(p)]))
    this.pagadas = new Set()
  }

  /**
   * Atajo de la demo: el monto de cada persona es el «monto por persona» del programa, si lo tiene.
   * En producción la liquidación es otro sistema y trae su propio monto. Lo conecta el contenedor.
   */
  montoPorPrograma: (programaId: string) => Promise<number | null> = async () => null

  /** CA-02.01: cuántas cédulas y el total que será el tope al autorizar (RN-08), sin novedades. */
  async resumen(programaId: string): Promise<Resumen> {
    const base = await this.montoPorPrograma(programaId)
    const incluidas = [...this.personas.values()].filter((p) => !p.novedad)
    return { cedulas: incluidas.length, total: String(incluidas.reduce((suma, p) => suma + (base ?? p.monto), 0)) }
  }

  /** CA-02.02 / CA-02.03; undefined si la cédula no está (CA-02.04). */
  async pago(programaId: string, documento: string): Promise<Pago | undefined> {
    const persona = this.personas.get(documento)
    if (!persona) return undefined
    if (this.pagadas.has(this.clave(programaId, documento))) return { documento, disponible: false, monto: null }
    const base = persona.novedad ? null : await this.montoPorPrograma(programaId)
    return { documento, disponible: true, monto: String(base ?? persona.monto), novedad: persona.novedad }
  }

  marcarPagada(programaId: string, documento: string): void {
    this.pagadas.add(this.clave(programaId, documento))
  }

  /** CA-02.07: novedad cargada después de aprobar (p. ej. un retroactivo de $460.000). */
  cargarNovedad(persona: PersonaLiquidada): void {
    this.personas.set(persona.documento, this.registro({ ...persona, novedad: true }))
  }

  buscar(cedulas: readonly string[]): Persona[] {
    return [...new Set(cedulas)].sort().flatMap((documento) => {
      const p = this.personas.get(documento)
      return p ? [{ documento, nombre: p.nombre, tienePin: p.pinHash !== null }] : []
    })
  }

  validarPin(documento: string, pin: string): boolean {
    const guardado = this.personas.get(documento)?.pinHash
    return guardado ? pinCoincide(guardado, pin) : false
  }

  /** Inscribe o actualiza: así un registro que falló a medias se puede repetir. */
  inscribir(documento: string, nombre: string, pin?: string): Persona {
    const actual = this.personas.get(documento)
    this.personas.set(documento, {
      nombre,
      monto: actual?.monto ?? MONTO_POR_DEFECTO,
      novedad: actual?.novedad ?? false,
      pinHash: pin ? hashPin(pin) : (actual?.pinHash ?? null),
    })
    return this.buscar([documento])[0]!
  }

  ponerPin(documento: string, pin: string): boolean {
    const persona = this.personas.get(documento)
    if (!persona) return false
    persona.pinHash = hashPin(pin)
    return true
  }

  private registro(p: PersonaLiquidada): Registro {
    return { nombre: p.nombre, monto: p.monto, novedad: p.novedad ?? false, pinHash: p.pin ? hashPin(p.pin) : null }
  }

  private clave(programaId: string, documento: string): string {
    return `${programaId}:${documento}`
  }
}
