// Liquidación simulada de la entidad (AD-13): en la demo hace el papel del sistema de la entidad.
// Datos de prueba (Arquitectura § 4.1): 3 cédulas de $230.000 (COP, escala 2) = $690.000.
import type { Pago, Resumen } from './contrato.ts'

export interface PersonaLiquidada {
  cedula: string
  nombre: string
  /** Unidades mínimas (COP escala 2). */
  monto: number
}

export const LIQUIDACION_DE_PRUEBA: readonly PersonaLiquidada[] = [
  { cedula: '1000000001', nombre: 'Ana Pérez', monto: 23_000_000 },
  { cedula: '1000000002', nombre: 'Luis Gómez', monto: 23_000_000 },
  { cedula: '1000000003', nombre: 'Jorge Ruiz', monto: 23_000_000 },
]

export class LiquidacionSimulada {
  private readonly personas: Map<string, PersonaLiquidada>
  private readonly pagadas = new Set<string>()

  constructor(personas: readonly PersonaLiquidada[] = LIQUIDACION_DE_PRUEBA) {
    this.personas = new Map(personas.map((p) => [p.cedula, { ...p }]))
  }

  /** CA-02.01: cuántas cédulas y el total que será el tope al autorizar (RN-08). */
  resumen(_programaId: string): Resumen {
    const total = [...this.personas.values()].reduce((suma, p) => suma + p.monto, 0)
    return { cedulas: this.personas.size, total: String(total) }
  }

  /** CA-02.02 / CA-02.03; undefined si la cédula no está (CA-02.04). */
  pago(programaId: string, cedula: string): Pago | undefined {
    const persona = this.personas.get(cedula)
    if (!persona) return undefined
    if (this.pagadas.has(this.clave(programaId, cedula))) return { cedula, disponible: false, monto: null }
    return { cedula, disponible: true, monto: String(persona.monto) }
  }

  marcarPagada(programaId: string, cedula: string): void {
    this.pagadas.add(this.clave(programaId, cedula))
  }

  /** CA-02.07: novedad cargada después de aprobar (p. ej. un retroactivo de $460.000). */
  cargarNovedad(persona: PersonaLiquidada): void {
    this.personas.set(persona.cedula, { ...persona })
  }

  private clave(programaId: string, cedula: string): string {
    return `${programaId}:${cedula}`
  }
}
