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
      return 'Esperando el PIN de la persona.'
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

  constructor(uow: UnidadDeTrabajo) {
    this.uow = uow
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
    return this.uow.transaccion(async (repos) => {
      if (!(await repos.cobros.actualizar(c.id, c.version, { ...extra, estado: hacia }))) return false
      await repos.eventos.registrar({
        tipoEntidad: 'cobro',
        idEntidad: c.id,
        estadoAnterior: c.estado,
        estadoNuevo: hacia,
        detalle: { texto: textoEvento(c, hacia, punto, motivo), ...(motivo ? { motivo } : {}), ...detalle },
        actor,
      })
      await tambien?.(repos)
      return true
    })
  }

  /** Un evento que no cambia el estado (p. ej. «el banco no respondió»). */
  async nota(id: string, texto: string, detalle: Record<string, unknown> = {}): Promise<void> {
    await this.uow.repos.eventos.registrar({ tipoEntidad: 'cobro', idEntidad: id, detalle: { texto, ...detalle } })
  }
}
