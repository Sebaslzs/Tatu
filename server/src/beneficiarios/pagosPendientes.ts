// Los subsidios que una persona tiene por cobrar (HU-08, CA-10.01): programas Activos o Pausados
// donde no ha cobrado y la liquidación tiene un pago para su cédula. Con `soloQueReciben`, solo los
// que hoy aceptan cobros: es lo que puede pagar un punto.
import { diaEnBogota, type Reloj } from '../comun/fechas.ts'
import { monto, type Monto } from '../comun/montos.ts'
import type { FilaBeneficiario } from '../db/repositorios/beneficiarios.ts'
import type { UnidadDeTrabajo } from '../db/unidadDeTrabajo.ts'
import { rn06ProgramaRecibe } from '../cobros/reglas.ts'
import type { PuertoLiquidacion } from '../liquidacion/contrato.ts'
import { monedaDe } from '../programas/vista.ts'

export interface PagoPendiente {
  programa: { id: string; nombre: string; estado: string; tipo: 'subsidio' | 'bono' }
  monto: Monto
  /** Día en que vence, en hora de Bogotá. */
  vigenciaFin: string
}

export interface ResultadoPagosPendientes {
  pagos: PagoPendiente[]
  /** false si la liquidación no respondió para algún programa: «sin pagos» no sería la verdad. */
  liquidacionDisponible: boolean
}

export interface OpcionesPagosPendientes {
  soloQueReciben?: boolean
  puntoId?: string
}

export class PagosPendientes {
  private readonly uow: UnidadDeTrabajo
  private readonly liquidacion: PuertoLiquidacion
  private readonly reloj: Reloj

  constructor(deps: { uow: UnidadDeTrabajo; liquidacion: PuertoLiquidacion; reloj: Reloj }) {
    this.uow = deps.uow
    this.liquidacion = deps.liquidacion
    this.reloj = deps.reloj
  }

  async de(persona: FilaBeneficiario, { soloQueReciben = false, puntoId }: OpcionesPagosPendientes = {}): Promise<ResultadoPagosPendientes> {
    const { repos } = this.uow
    const [punto, propios, todos] = await Promise.all([
      puntoId ? repos.puntos.obtener(puntoId) : Promise.resolve(undefined),
      repos.cobros.deBeneficiario(persona.id),
      repos.programas.listar(),
    ])
    const ahora = this.reloj()
    const candidatos = []
    for (const p of todos.filter((x) => x.estado === 'Activo' || x.estado === 'Pausado')) {
      if (propios.some((c) => c.programaId === p.id && c.estado === 'Pagado')) continue
      if (soloQueReciben && rn06ProgramaRecibe({ estado: p.estado, vigenciaInicio: p.vigenciaInicio, vigenciaFin: p.vigenciaFin, ahora })) continue
      // Con el permiso vencido el pago fallaría: el punto no lo ofrece hasta que la entidad lo renueve
      if (soloQueReciben && p.permisoVencidoEn) continue
      // Un punto de retiro paga subsidios; una sede de comercio, los bonos que acepta
      if (punto && (punto.tipo === 'retiro' ? p.destino !== 'libre' : p.destino !== 'restringido' || !(await repos.puntos.autorizadoEnPrograma(p.id, punto.id)))) continue
      candidatos.push(p)
    }

    // La liquidación de cada programa, en paralelo
    let liquidacionDisponible = true
    const consultas = await Promise.all(
      candidatos.map(async (p) => {
        try {
          return { p, pago: await this.liquidacion.pago(p.id, persona.numeroDocumento) }
        } catch {
          liquidacionDisponible = false
          return { p, pago: null }
        }
      }),
    )
    const pagos: PagoPendiente[] = []
    for (const { p, pago } of consultas) {
      if (pago?.tipo !== 'disponible') continue
      pagos.push({
        programa: { id: p.id, nombre: p.nombre, estado: p.estado, tipo: p.tipo },
        monto: monto(pago.monto, monedaDe(p)),
        vigenciaFin: diaEnBogota(p.vigenciaFin),
      })
    }
    return { pagos, liquidacionDisponible }
  }
}
