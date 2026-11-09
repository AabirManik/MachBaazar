/**
 * Sui balance reads.
 *
 * Queries native SUI and USDC coin balances for an address. These are
 * read-only RPC calls — no signing, no state changes.
 */

import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc'
import { SUI_COIN, USDC_COIN_TYPES, atomicToDecimal } from './suiCoinUtils.js'

export type SuiBalances = {
  sui: string
  usdc: string
  address: string
  network: string
}

export async function getSuiBalances(
  client: SuiJsonRpcClient,
  address: string,
  network: string
): Promise<SuiBalances> {
  // Native SUI balance
  const suiBalance = await client.getBalance({ owner: address })
  const sui = atomicToDecimal(
    BigInt(suiBalance.totalBalance),
    SUI_COIN.decimals
  )

  // USDC balance via coin type
  let usdc = '0.000000'
  const usdcInfo = USDC_COIN_TYPES[network]
  if (usdcInfo) {
    try {
      const usdcBalance = await client.getBalance({
        owner: address,
        coinType: usdcInfo.coinType
      })
      usdc = atomicToDecimal(
        BigInt(usdcBalance.totalBalance),
        usdcInfo.decimals
      )
    } catch {
      // Coin type may not exist on this network yet — report zero.
      usdc = '0.000000'
    }
  }

  return { sui, usdc, address, network }
}
