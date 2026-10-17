// HU-08 · «Tengo $230.000»: todo lo que la persona necesita ver en una pantalla. Una persona puede
// tener varios subsidios pendientes a la vez (CA-08.04); los ya cobrados quedan en el historial.
import { noEncontrado } from '../comun/errores.ts'
import type { UnidadDeTrabajo } from '../db/unidadDeTrabajo.ts'
import type { VistaCobro, VistasCobro } from '../cobros/vista.ts'
import type { VistaCuenta } from '../cuentas/vista.ts'
import { vistaCuenta } from '../cuentas/vista.ts'
import { billeteraCorta } from '../comun/billeteras.ts'
import type { PagoPendiente, PagosPendientes } from './pagosPendientes.ts'

export interface PuntoDeRetiro {
  id: string
  nombre: string
  direccion: string
  billeteraCorta: string
}

export interface ResumenBeneficiario {
  persona: { nombre: string; documento: string; tienePin: boolean }
  /** CA-08.01: todos los subsidios y bonos pendientes, cada uno con su monto y su moneda. */
  pagos: PagoPendiente[]
  /** El primero, para quien solo mira un pago. */
  pago: PagoPendiente | null
  liquidacionDisponible: boolean
  /** La cuenta: «A mi cuenta» se ofrece solo si está Verificada. */
  cuenta: VistaCuenta | null
  /** «En un punto»: dónde puede retirar. */
  puntos: PuntoDeRetiro[]
  /** CA-08.02: cuándo, dónde y la referencia del último cobro. */
  ultimoCobro: VistaCobro | null
  historial: VistaCobro[]
}

export class ConsultaResumenBeneficiario {
  private readonly uow: UnidadDeTrabajo
  private readonly pagosPendientes: PagosPendientes
  private readonly vistas: VistasCobro

  constructor(deps: { uow: UnidadDeTrabajo; pagosPendientes: PagosPendientes; vistas: VistasCobro }) {
    this.uow = deps.uow
    this.pagosPendientes = deps.pagosPendientes
    this.vistas = deps.vistas
  }

  async de(documento: string): Promise<ResumenBeneficiario> {
    const { repos } = this.uow
    const persona = await repos.beneficiarios.porCedula(documento)
    if (!persona) throw noEncontrado('Esa cédula no está registrada', 'PersonaNoEncontrada')
    const [propios, pendientes, cuenta, personas, puntos] = await Promise.all([
      repos.cobros.deBeneficiario(persona.id),
      this.pagosPendientes.de(persona),
      repos.cuentas.ultimaDe(persona.id),
      this.vistas.personas([documento]),
      repos.puntos.listar(),
    ])
    const historial = await this.vistas.de(propios, { eventos: false })
    const { pagos, liquidacionDisponible } = pendientes
    return {
      persona: {
        nombre: personas.get(documento)?.nombre ?? `Persona ${documento.slice(-4)}`,
        documento: persona.numeroDocumento,
        tienePin: personas.get(documento)?.tienePin ?? false,
      },
      pagos,
      pago: pagos[0] ?? null,
      liquidacionDisponible,
      cuenta: cuenta ? vistaCuenta(cuenta, persona.numeroDocumento) : null,
      puntos: puntos
        .filter((p) => p.tipo === 'retiro')
        .map((p) => ({ id: p.id, nombre: p.nombre, direccion: p.direccion, billeteraCorta: billeteraCorta(p.billetera) })),
      ultimoCobro: historial.find((c) => c.estado === 'Pagado' || c.estado === 'Pagando') ?? null,
      historial,
    }
  }
}
