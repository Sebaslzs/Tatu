// Catálogo único de rechazos (HU-13): un texto por causa, en un solo lugar. El código es lo que se
// guarda en `cobro.motivo_rechazo`; el mensaje es lo que ve la persona.

export const MOTIVOS = {
  YaCobrado: { mensaje: 'Este subsidio ya fue cobrado', estado: 'Rechazado' },
  EnProceso: { mensaje: 'Este subsidio ya está en proceso o fue cobrado', estado: 'Rechazado' },
  TopeSuperado: { mensaje: 'El banco rechazó el pago: el programa llegó a su tope', estado: 'Fallido' },
  ProgramaCerrado: { mensaje: 'El programa está cerrado y ya no recibe cobros', estado: 'Rechazado' },
  SinPagoDisponible: { mensaje: 'Esta cédula no tiene pagos disponibles en este programa', estado: 'Rechazado' },
  CuentaNoVerificada: { mensaje: 'Primero enlaza y verifica tu cuenta', estado: 'Rechazado' },
  PinBloqueado: { mensaje: 'No pudimos confirmar tu identidad', estado: 'Rechazado' },
  TiempoAgotado: { mensaje: 'No pudimos confirmar tu identidad', estado: 'Rechazado' },
  ProgramaNoRecibe: { mensaje: 'El programa no está recibiendo cobros', estado: 'Rechazado' },
  SinFondos: { mensaje: 'El programa no tiene fondos en este momento', estado: 'Fallido' },
  LiquidacionNoResponde: { mensaje: 'No pudimos consultar tu pago; intenta en un momento', estado: 'Rechazado' },
  PermisoVencido: { mensaje: 'El permiso venció: apruébalo de nuevo', estado: 'Fallido' },
  // El permiso lo pidió otro servidor de Tatú con otras llaves de Open Payments (configuración)
  LlavesDistintas: { mensaje: 'Este servidor usa otras llaves que las que aprobaron el permiso. No se movió dinero', estado: 'Fallido' },
  Cancelado: { mensaje: 'El cobro se canceló. No se movió dinero', estado: 'Rechazado' },
  // Bono con destino (HU-21)
  ComercioNoAutorizado: { mensaje: 'Este comercio no acepta este bono', estado: 'Rechazado' },
  SoloEnComercios: { mensaje: 'Este bono solo se usa en comercios autorizados', estado: 'Rechazado' },
  // Respuesta definitiva del banco que no es el tope (un 4xx, o un pago fallido sin causa confirmada)
  ErrorPago: { mensaje: 'El banco no pudo procesar el pago. No se movió dinero', estado: 'Fallido' },
  // Llave Bre-B: RN-18 la vuelve a resolver antes de pagar
  LlaveNoExiste: { mensaje: 'Tu llave Bre-B ya no existe: enlaza otra o cobra en un punto', estado: 'Rechazado' },
  PuenteNoResponde: { mensaje: 'No pudimos consultar Bre-B; intenta en un momento', estado: 'Rechazado' },
  // Retiro parcial y venta (HU-26, HU-27). La API los revisa antes y responde 422 sin crear el cobro;
  // estos códigos quedan cuando lo decidió la base en el mismo instante (dos solicitudes a la vez).
  SaldoInsuficiente: { mensaje: 'El retiro supera el saldo disponible', estado: 'Rechazado' },
  MontoNoPermitido: { mensaje: 'El valor del retiro no cumple las reglas del programa', estado: 'Rechazado' },
  VentaNoPermitida: { mensaje: 'La compra registrada no cumple las reglas del retiro', estado: 'Rechazado' },
} as const satisfies Record<string, { mensaje: string; estado: 'Rechazado' | 'Fallido' }>

export type Motivo = keyof typeof MOTIVOS

export interface MotivoVisible {
  codigo: string
  mensaje: string
}

export function motivo(codigo: Motivo): MotivoVisible {
  return { codigo, mensaje: MOTIVOS[codigo].mensaje }
}

/** Un motivo guardado en la base → lo que ve la persona. Si el código no está en el catálogo, se muestra tal cual. */
export function motivoDesdeBd(codigo: string | null): MotivoVisible | null {
  if (!codigo) return null
  return codigo in MOTIVOS ? motivo(codigo as Motivo) : { codigo, mensaje: codigo }
}

/** El PIN incorrecto no es un motivo: es la respuesta 422 (CA-11.02). */
export function mensajePinIncorrecto(restantes: number): string {
  return restantes === 1 ? 'PIN incorrecto, te queda 1 intento' : `PIN incorrecto, te quedan ${restantes} intentos`
}
