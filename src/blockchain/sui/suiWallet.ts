/**
 * Sui wallet — the ONLY place that touches the Sui private key.
 *
 * Responsibilities:
 *  - derive the Sui address from the configured private key
 *  - expose the keypair for signing (used by suiTransaction.ts)
 *
 * No LLM input reaches this module beyond "which configured key to use".
 * Keys are never logged and never returned to the caller as plaintext.
 */

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import type { Keypair } from '@mysten/sui/cryptography'

export function getSuiKeypair(privateKey: string): Keypair {
  // Accept a `suiprivkey1...` mnemonic-style key or raw private key bytes.
  return Ed25519Keypair.fromSecretKey(privateKey)
}

export function getSuiAddress(privateKey: string): string {
  const keypair = getSuiKeypair(privateKey)
  return keypair.getPublicKey().toSuiAddress()
}
