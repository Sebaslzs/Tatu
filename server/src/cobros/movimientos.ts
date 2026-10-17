// Cambios de estado del cobro: una sola puerta para que cada transición sea válida, atómica con su
// bloqueo optimista (CA-14.03) y deje su evento con la línea de tiempo en palabras sencillas (HU-16).
import { noEncontrado } from '../comun/errores.ts'
import type { CamposCobro, FilaCobro } from '../db/repositorios/cobros.ts'
import { actorBeneficiario, actorPunto, type Actor } from '../db/repositorios/eventos.ts'
import type { FilaPunto } from '../db/repositorios/puntos.ts'
import type { Repos, UnidadDeTrabajo } from '../db/unidadDeTrabajo.ts'
import { puedeTransicionar, TransicionInvalida, type EstadoCobro } from './estados.ts'
import { MOTIVOS, type Motivo } from './mensajes.ts'

/** El texto que ve la persona en la línea de tiempo de cada paso. */
export function textoEvento(c: Pick<FilaCobro, 'canal'>, hacia: EstadoCobro, punto?: FilaPunto, motivo?: Motivo): string {
  if (motivo) return MOTIVOS[motivo].mensaje
  const enCuenta = c.canal === 'cuenta'
  if (c.canal === 'compra') {
    if (hacia === 'Solicitado') return `${punto?.nombre ?? 'El comercio'} registró una compra con bono.`
    if (hacia === 'Pagando') return 'PIN correcto. Pagando el bono al comercio.'
    if (hacia === 'Pagado') return 'Pago recibido. El bono quedó aplicado a la compra.'
  }
  switch (hacia) {
    case 'Solicitado':
      return enCuenta ? 'Solicitaste el cobro a tu cuenta.' : `${punto?.nombre ?? 'El punto'} digitó la cédula.`
    case 'PorConfirmar':
      // En un retiro la persona se verifica con rostro o huella; en una compra con bono, con su PIN
      return c.canal === 'retiro' ? 'Esperando que la persona verifique su identidad.' : 'Esperando el PIN de la persona.'
    case 'Pagando':
      return enCuenta ? 'Enviando el pago a tu cuenta.' : 'PIN correcto. Enviando el pago al punto.'
    case 'Pagado':
      return enCuenta ? 'El pago llegó a tu cuenta.' : 'Pago recibido. Ya se puede entregar el efectivo.'
    default:
      return hacia
  }
}

/** Quién mueve el cobro: el punto (o comercio) que digitó la cédula, o la persona en el canal cuenta. */
export function actorDe(c: Pick<FilaCobro, 'puntoId' | 'beneficiarioId'>): Actor {
  return c.puntoId ? actorPunto(c.puntoId) : actorBeneficiario(c.beneficiarioId)
}

export class MovimientosCobro {
  private readonly uow: UnidadDeTrabajo
  /** Quién envía a facturación la venta de un retiro que quedó Pagado (lo conecta el contenedor). */
  private alQuedarPorEnviar: ((ventaId: string) => void) | undefined

  constructor(uow: UnidadDeTrabajo) {
    this.uow = uow
  }

  /** HU-27: al quedar Pagado un retiro con venta, se avisa para enviarla a facturación (después de guardar). */
  alPagarVenta(enviar: (ventaId: string) => void): void {
    this.alQuedarPorEnviar = enviar
  }

  /** El cobro o 404. */
  async exigir(id: string): Promise<FilaCobro> {
    const c = await this.uow.repos.cobros.obtener(id)
    if (!c) throw noEncontrado('Ese cobro no existe', 'CobroNoEncontrado')
    return c
  }

  /**
   * Cambia el estado con bloqueo optimista y escribe su evento, en una transacción. `tambien` corre
   * dentro de la misma transacción si el cambio se hizo. Devuelve false si otra petición lo cambió antes.
   */
  async mover(
    c: FilaCobro,
    hacia: EstadoCobro,
    extra: CamposCobro = {},
    detalle: Record<string, unknown> = {},
    actor: Actor = 'sistema',
    tambien?: (repos: Repos) => Promise<void>,
  ): Promise<boolean> {
    if (!puedeTransicionar(c.estado, hacia)) throw new TransicionInvalida(c.estado, hacia)
    const motivo = (extra.motivoRechazo ?? undefined) as Motivo | undefined
    const punto = c.puntoId ? await this.uow.repos.puntos.obtener(c.puntoId) : undefined
    let ventaPorEnviar: string | null = null
    const hecho = await this.uow.transaccion(async (repos) => {
      // La venta se lee antes: en Supabase el trigger `cobro_mueve_venta` la mueve con el cobro
      const venta = c.canal === 'retiro' ? await repos.ventas.deCobro(c.id) : undefined
      if (!(await repos.cobros.actualizar(c.id, c.version, { ...extra, estado: hacia }))) return false
      await repos.eventos.registrar({
        tipoEntidad: 'cobro',
        idEntidad: c.id,
        estadoAnterior: c.estado,
        estadoNuevo: hacia,
        detalle: { texto: textoEvento(c, hacia, punto, motivo), ...(motivo ? { motivo } : {}), ...detalle },
        actor,
      })
      if (venta?.estado === 'Registrada') ventaPorEnviar = await this.seguirVenta(repos, venta.id, c, hacia)
      await tambien?.(repos)
      return true
    })
    if (hecho && ventaPorEnviar) this.alQuedarPorEnviar?.(ventaPorEnviar)
    return hecho
  }

  /**
   * La venta sigue al retiro (HU-27): Pagado → por enviar a facturación; Rechazado o Fallido → anulada,
   * porque sin pago no hubo venta. Devuelve el id si quedó por enviar.
   */
  private async seguirVenta(repos: Repos, ventaId: string, c: FilaCobro, hacia: EstadoCobro): Promise<string | null> {
    const destino = hacia === 'Pagado' ? 'PorEnviar' : hacia === 'Rechazado' || hacia === 'Fallido' ? 'Anulada' : null
    if (!destino) return null
    await repos.ventas.seguirAlCobro(c.id, destino)
    await repos.eventos.registrar({
      tipoEntidad: 'venta',
      idEntidad: ventaId,
      estadoAnterior: 'Registrada',
      estadoNuevo: destino,
      detalle: {
        texto: destino === 'PorEnviar' ? `Retiro ${c.referencia} pagado: la compra queda lista para facturar.` : `El retiro ${c.referencia} no se pagó: la compra se anula.`,
        cobro: c.id,
      },
    })
    return destino === 'PorEnviar' ? ventaId : null
  }

  /** Un evento que no cambia el estado (p. ej. «el banco no respondió»). */
  async nota(id: string, texto: string, detalle: Record<string, unknown> = {}): Promise<void> {
    await this.uow.repos.eventos.registrar({ tipoEntidad: 'cobro', idEntidad: id, detalle: { texto, ...detalle } })
  }
}
