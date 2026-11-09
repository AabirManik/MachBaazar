import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadConfig } from '../src/config.js'

vi.mock('../src/wallet-store.js', () => ({
  loadWalletConfig: vi.fn(() => null)
}))

describe('loadConfig', () => {
  beforeEach(() => {
    delete process.env.SUI_PRIVATE_KEY
    delete process.env.NETWORK
    delete process.env.MAX_PER_CALL
    delete process.env.MAX_PER_DAY
  })

  it('returns READ_ONLY when no keys are set', () => {
    const config = loadConfig()
    expect(config.mode).toBe('READ_ONLY')
    expect(config.canPay).toBe(false)
    expect(config.canPaySui).toBe(false)
  })

  it('returns SUI_ONLY when only Sui key is set', () => {
    process.env.SUI_PRIVATE_KEY = 'suiprivkey1...'
    const config = loadConfig()
    expect(config.mode).toBe('FULL')
    expect(config.canPay).toBe(true)
    expect(config.canPaySui).toBe(true)
  })

  it('uses default network sui-testnet', () => {
    const config = loadConfig()
    expect(config.network).toBe('sui-testnet')
  })

  it('respects NETWORK env var', () => {
    process.env.NETWORK = 'sui-mainnet'
    const config = loadConfig()
    expect(config.network).toBe('sui-mainnet')
  })

  it('uses default budget limits', () => {
    const config = loadConfig()
    expect(config.budget.maxPerCall).toBe('0.10')
    expect(config.budget.maxPerDay).toBe('20.00')
  })

  it('respects budget env vars', () => {
    process.env.MAX_PER_CALL = '1.00'
    process.env.MAX_PER_DAY = '50.00'
    const config = loadConfig()
    expect(config.budget.maxPerCall).toBe('1.00')
    expect(config.budget.maxPerDay).toBe('50.00')
  })

  it('reload refreshes config', () => {
    process.env.SUI_PRIVATE_KEY = 'suiprivkey1...'
    const config1 = loadConfig()
    expect(config1.canPaySui).toBe(true)

    delete process.env.SUI_PRIVATE_KEY
    const config2 = loadConfig()
    expect(config2.canPaySui).toBe(false)
  })
})
