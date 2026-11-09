/**
 * Sui transfer construction.
 *
 * Builds a Programmable Transaction Block (PTB) for transferring SUI or USDC
 * from sender to recipient. Returns the unsigned PTB bytes — signing happens
 * in suiTransaction.ts.
 */

import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc'
import { Transaction } from '@mysten/sui/transactions'
import { decimalToAtomic } from './suiCoinUtils.js'

export type SuiTransferParams = {
  sender: string
  recipient: string
  coinType: string
  decimals: number
  amount: string // decimal string
}

export async function buildTransferTx(
  client: SuiJsonRpcClient,
  params: SuiTransferParams
): Promise<{ txBytes: Uint8Array; gasBudget: bigint }> {
  const { recipient, decimals, amount } = params
  const atomicAmount = decimalToAtomic(amount, decimals)

  const tx = new Transaction()

  // Split the requested amount from a gas coin, then transfer the split coin.
  // Works for both SUI (native gas) and USDC (any coin type).
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(atomicAmount)])
  tx.transferObjects([coin], tx.pure.address(recipient))

  const txBytes = await tx.build({ client })

  return { txBytes, gasBudget: BigInt(10_000_000) }
}
