export type PaymentNetwork = 'sui-testnet' | 'sui-mainnet'

export interface AppConfig {
  suiPrivateKey?: string
  network: PaymentNetwork
  budget: BudgetConfig
  canPay: boolean
  canPaySui: boolean
  mode: 'READ_ONLY' | 'SUI_ONLY' | 'FULL'
  reload(): void
}

export interface BudgetConfig {
  maxPerCall: string
  maxPerDay: string
}

export interface WalletFileConfig {
  suiPrivateKey?: string
  network?: string
  createdAt?: string
}

export interface SpendingRecord {
  recipient: string
  amount: string
  network: string
  timestamp: string
}
