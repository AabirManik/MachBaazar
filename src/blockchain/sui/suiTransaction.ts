/**
 * Sui transaction execution.
 *
 * Separation of concerns enforced:
 *   construct (suiTransfer) → sign (here) → submit (here) → verify (Phase 4 / Tatum)
 *
 * Returns the transaction digest and effects so callers can verify settlement.
 */

import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'

export type SuiTxResult = {
  digest: string
  effects: {
    status: { success: boolean; error?: unknown }
    gasUsed: { computationCost: string; storageCost: string }
    objectChanges?: unknown[]
  }
}

export async function signAndExecute(
  client: SuiJsonRpcClient,
  privateKey: string,
  txBytes: Uint8Array
): Promise<SuiTxResult> {
  const keypair = Ed25519Keypair.fromSecretKey(privateKey)
  const signature = await keypair.sign(txBytes)

  const response = await client.executeTransactionBlock({
    transactionBlock: txBytes,
    signature: signature as unknown as never,
    options: {
      showEffects: true,
      showObjectChanges: true
    }
  })

  const effects = response.effects

  return {
    digest: response.digest,
    effects: {
      status: {
        success: Boolean((effects as any)?.status?.success),
        error: null
      },
      gasUsed: effects?.gasUsed ?? {
        computationCost: '0',
        storageCost: '0'
      },
      objectChanges: (effects as unknown as { objectChanges?: unknown[] })
        .objectChanges
    }
  }
}

export function isTransactionSuccessful(result: SuiTxResult): boolean {
  return result.effects.status.success === true
}
