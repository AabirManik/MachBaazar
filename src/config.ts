import type { PaymentNetwork, AppConfig } from '@/types.js'
import { loadWalletConfig } from '@/wallet-store.js'

export function loadConfig(): AppConfig {
  const state = buildState()
  return {
    ...state,
    reload() {
      const fresh = buildState()
      Object.assign(this, fresh)
    }
  }
}

function buildState(): Omit<AppConfig, 'reload'> {
  const wallet = loadWalletConfig()

  const suiPrivateKey =
    process.env.SUI_PRIVATE_KEY ?? wallet?.suiPrivateKey ?? undefined
  const network = (process.env.NETWORK ??
    wallet?.network ??
    'sui-testnet') as PaymentNetwork

  const maxPerCall = process.env.MAX_PER_CALL ?? '0.10'
  const maxPerDay = process.env.MAX_PER_DAY ?? '20.00'

  const canPaySui = !!suiPrivateKey
  const canPay = canPaySui

  let mode: AppConfig['mode'] = 'READ_ONLY'
  if (canPaySui) mode = 'FULL'

  return {
    suiPrivateKey,
    network,
    budget: { maxPerCall, maxPerDay },
    canPay,
    canPaySui,
    mode
  }
}
