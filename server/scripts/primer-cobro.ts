// E2E contra la Test Wallet con el SDK (hito crítico del viernes 14:00, HU-12).
// Uso: pnpm --filter server exec tsx scripts/primer-cobro.ts
import { config } from '../src/config.ts'
import { OpenPaymentsService } from '../src/openPaymentsService.ts'

if (!config.OP_CLIENT_WALLET_ADDRESS) {
  console.error('Configura OP_CLIENT_WALLET_ADDRESS, OP_KEY_ID y la llave en .env')
  process.exit(1)
}

const op = new OpenPaymentsService(config)
console.log('Wallet del cliente:', await op.resolver(config.OP_CLIENT_WALLET_ADDRESS))
// Siguiente paso: grant de pago entrante → incomingPayment.create → outgoingPayment.create
