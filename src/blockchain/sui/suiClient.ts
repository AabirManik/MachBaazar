/**
 * Sui client factory.
 *
 * Builds a `SuiJsonRpcClient` from `@mysten/sui/json-rpc` for the configured
 * Sui network. This is the read-only RPC entry point; signing never happens
 * here — signing is in suiWallet.ts / suiTransaction.ts.
 */

import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc'

export type SuiNetwork = 'sui-testnet' | 'sui-mainnet'

export function suiNetworkFromEnv(env: string | undefined): SuiNetwork {
  return (env ?? 'sui-testnet') as SuiNetwork
}

export function createSuiClient(network: SuiNetwork): SuiJsonRpcClient {
  return new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl(
      network === 'sui-mainnet' ? 'mainnet' : 'testnet'
    ),
    network: network === 'sui-mainnet' ? 'mainnet' : 'testnet'
  })
}

export function isSuiNetworkClient(network: string): network is SuiNetwork {
  return network === 'sui-testnet' || network === 'sui-mainnet'
}
