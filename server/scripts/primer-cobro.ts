// E2E contra la Test Wallet con el SDK (hito crítico del viernes 14:00, HU-12).
// Uso: pnpm --filter server exec tsx scripts/primer-cobro.ts
import { consultarWallet } from '../src/openPaymentsService.ts'
import { config } from '../src/config.ts'

if (!config.OP_CLIENT_WALLET_ADDRESS) {
  console.error('Configura OP_CLIENT_WALLET_ADDRESS, OP_KEY_ID y la llave en .env')
  process.exit(1)
}

const wallet = await consultarWallet(config.OP_CLIENT_WALLET_ADDRESS)
console.log('Wallet del cliente:', wallet)
// Siguiente paso: grant de pago entrante → incomingPayment.create → outgoingPayment.create
