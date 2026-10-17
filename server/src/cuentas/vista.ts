// Lo que la API muestra de una cuenta. Nunca el nombre del titular ni tokens (CA-07.07).
import { billeteraCorta } from '../comun/billeteras.ts'
import type { FilaCuenta } from '../db/repositorios/cuentas.ts'
import { enmascararLlave } from '../puente/enmascarar.ts'

export interface VistaCuenta {
  id: string
  documento: string
  estado: FilaCuenta['estado']
  billetera: string
  billeteraCorta: string
  /** Llave Bre-B elegida; null si la cuenta es una billetera escrita a mano. */
  tipoLlave: FilaCuenta['tipoLlave']
  /** La llave enmascarada, nunca completa. */
  llave: string | null
  verificadaEn: string | null
}

export function vistaCuenta(c: FilaCuenta, documento: string): VistaCuenta {
  return {
    id: c.id,
    documento,
    estado: c.estado,
    billetera: c.billetera,
    billeteraCorta: billeteraCorta(c.billetera),
    tipoLlave: c.tipoLlave,
    llave: c.tipoLlave && c.llave ? enmascararLlave(c.tipoLlave, c.llave) : null,
    verificadaEn: c.verificadaEn,
  }
}
