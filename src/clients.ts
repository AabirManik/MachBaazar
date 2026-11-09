import type { PaymentNetwork, AppConfig } from '@/types.js'
import { createSuiClient } from '@/blockchain/sui/suiClient.js'
import { getSuiAddress } from '@/blockchain/sui/suiWallet.js'
import { getSuiBalances } from '@/blockchain/sui/suiBalance.js'

const CAIP2_NETWORKS: Record<PaymentNetwork, string> = {
  'sui-testnet': 'sui:testnet',
  'sui-mainnet': 'sui:mainnet'
}

export function isSuiNetworkClient(network: PaymentNetwork): boolean {
  return network === 'sui-testnet' || network === 'sui-mainnet'
}

export function getCaip2Network(network: PaymentNetwork): string {
  return CAIP2_NETWORKS[network]
}

/**
 * createHttpClient — Sui-only.
 *
 * Returns a SuiJsonRpcClient bound to the configured network. The x402
 * payment scheme for Sui is scheduled for Phase 3; until then
 * createPaymentPayload / encodePaymentSignatureHeader throw a clear,
 * actionable error rather than silently succeeding.
 */
export async function createHttpClient(
  network: PaymentNetwork,
  config: AppConfig
): Promise<any> {
  if (!isSuiNetworkClient(network)) {
    throw new Error(
      `Unsupported network ${network} — Sui is the only active chain`
    )
  }

  if (!config.suiPrivateKey) {
    throw new Error(`No Sui private key configured for network ${network}`)
  }

  const suiClient = createSuiClient(network)
  return {
    client: suiClient,
    network,
    createPaymentPayload: () => {
      throw new Error(
        'Sui x402 payment scheme not yet implemented — scheduled for Phase 3. ' +
          'Use check_balance for Sui balance reads in the meantime.'
      )
    },
    encodePaymentSignatureHeader: () => {
      throw new Error(
        'Sui x402 payment scheme not yet implemented — scheduled for Phase 3.'
      )
    }
  }
}

export async function getWalletAddress(
  network: PaymentNetwork,
  config: AppConfig
): Promise<string> {
  if (isSuiNetworkClient(network) && config.suiPrivateKey) {
    return getSuiAddress(config.suiPrivateKey)
  }

  throw new Error(`No key configured for network ${network}`)
}

export async function getUsdcBalance(
  network: PaymentNetwork,
  config: AppConfig
): Promise<string> {
  if (isSuiNetworkClient(network) && config.suiPrivateKey) {
    const address = getSuiAddress(config.suiPrivateKey)
    const client = createSuiClient(network)
    const { sui, usdc } = await getSuiBalances(client, address, network)
    return `${usdc} USDC (${sui} SUI)`
  }

  throw new Error(`No key configured for network ${network}`)
}
