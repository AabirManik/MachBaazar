/**
 * Sui coin utilities.
 *
 * Decimals, atomic-unit conversion, and the Sui USDC coin type for each
 * network. These are read-only constants — no signing, no RPC calls here.
 */

export type SuiCoinInfo = {
  decimals: number
  coinType: string
}

/**
 * SUI is the native gas token on every Sui network.
 */
export const SUI_COIN: SuiCoinInfo = {
  decimals: 9,
  coinType: '0x2::sui::SUI'
}

/**
 * USDC coin types on Sui (testnet / mainnet).
 *
 * These are the standard Circle-issued USDC coin types. If the on-chain type
 * differs for a given network, update here and re-verify against the network.
 */
export const USDC_COIN_TYPES: Record<string, SuiCoinInfo> = {
  'sui-testnet': {
    decimals: 6,
    coinType:
      '0x458a2181e2f5022f084e2ec9b73b8cfd0bc1b709f499a2dcd0e93e39b694c4::usdc::USDC'
  },
  'sui-mainnet': {
    decimals: 6,
    coinType: '0xd5c857beb62e9448ffb268273e19361f9c43266e::usdc::USDC'
  }
}

export function atomicToDecimal(
  atomicAmount: bigint,
  decimals: number
): string {
  const raw = atomicAmount
  const divisor = BigInt(10 ** decimals)
  const whole = raw / divisor
  const frac = raw % divisor
  return `${whole}.${frac.toString().padStart(decimals, '0')}`
}

export function decimalToAtomic(amount: string, decimals: number): string {
  const parts = amount.split('.')
  const whole = parts[0] || '0'
  const frac = (parts[1] || '').padEnd(decimals, '0').slice(0, decimals)
  return (BigInt(whole) * BigInt(10 ** decimals) + BigInt(frac)).toString()
}
