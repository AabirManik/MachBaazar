import { describe, it, expect, vi, beforeEach } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AppConfig } from '../src/types.js'
import { SpendingTracker } from '../src/spending.js'
import { registerPay } from '../src/tools/pay.js'

vi.mock('../src/clients.js', () => ({
  createHttpClient: vi.fn(),
  getCaip2Network: vi.fn((net: string) => {
    const map: Record<string, string> = {
      'sui-testnet': 'sui:testnet',
      'sui-mainnet': 'sui:mainnet'
    }
    return map[net]
  }),
  isSuiNetworkClient: vi.fn((net: string) => net.startsWith('sui'))
}))

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    suiPrivateKey: undefined,
    network: 'sui-testnet',
    budget: { maxPerCall: '1.00', maxPerDay: '20.00' },
    canPay: false,
    canPaySui: false,
    mode: 'READ_ONLY',
    reload: vi.fn(),
    ...overrides
  }
}

function extractToolHandler(
  server: McpServer
): (...args: unknown[]) => Promise<unknown> {
  const calls = vi.mocked(server.tool).mock.calls
  const call = calls.find(c => c[0] === 'pay')
  return call![call!.length - 1] as (...args: unknown[]) => Promise<unknown>
}

describe('pay tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers the tool with correct name', () => {
    const server = { tool: vi.fn() } as unknown as McpServer
    const config = makeConfig()
    const spending = new SpendingTracker(config.budget)
    registerPay(server, config, spending)
    expect(server.tool).toHaveBeenCalledWith(
      'pay',
      expect.any(String),
      expect.any(Object),
      expect.any(Function)
    )
  })

  it('returns error when no wallet configured', async () => {
    const server = { tool: vi.fn() } as unknown as McpServer
    const config = makeConfig({ canPay: false })
    const spending = new SpendingTracker(config.budget)
    registerPay(server, config, spending)

    const handler = extractToolHandler(server)
    const result = (await handler({
      amount: '0.05',
      recipient: '0xRecipient',
      network: 'sui-testnet'
    })) as { isError: boolean; content: { text: string }[] }

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('No wallet configured')
  })

  it('returns error when Sui key not configured for Sui network', async () => {
    const server = { tool: vi.fn() } as unknown as McpServer
    const config = makeConfig({
      canPay: true,
      suiPrivateKey: undefined,
      mode: 'READ_ONLY'
    })
    const spending = new SpendingTracker(config.budget)
    registerPay(server, config, spending)

    const handler = extractToolHandler(server)
    const result = (await handler({
      amount: '0.05',
      recipient: '0xRecipient',
      network: 'sui-testnet'
    })) as { isError: boolean; content: { text: string }[] }

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Sui key not configured')
  })

  it('rejects payment exceeding per-call budget', async () => {
    const server = { tool: vi.fn() } as unknown as McpServer
    const config = makeConfig({
      canPay: true,
      canPaySui: true,
      suiPrivateKey: 'suiprivkey1...',
      mode: 'FULL',
      budget: { maxPerCall: '0.01', maxPerDay: '20.00' }
    })
    const spending = new SpendingTracker(config.budget)
    registerPay(server, config, spending)

    const handler = extractToolHandler(server)
    const result = (await handler({
      amount: '0.50',
      recipient: '0xRecipient',
      network: 'sui-testnet'
    })) as { isError: boolean; content: { text: string }[] }

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('exceeds per-call limit')
  })

  it('returns error when Sui x402 payment scheme not implemented', async () => {
    const server = { tool: vi.fn() } as unknown as McpServer
    const config = makeConfig({
      canPay: true,
      canPaySui: true,
      suiPrivateKey: 'suiprivkey1...',
      mode: 'FULL'
    })
    const spending = new SpendingTracker(config.budget)
    registerPay(server, config, spending)

    const handler = extractToolHandler(server)
    const result = (await handler({
      amount: '0.05',
      recipient: '0xRecipient',
      network: 'sui-testnet',
      resource: 'https://api.example.com/data'
    })) as { isError: boolean; content: { text: string }[] }

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('not yet implemented')
    expect(result.content[0].text).toContain('Phase 3')
  })

  it('does not record spending when payment fails', async () => {
    const server = { tool: vi.fn() } as unknown as McpServer
    const config = makeConfig({
      canPay: true,
      canPaySui: true,
      suiPrivateKey: 'suiprivkey1...',
      mode: 'FULL'
    })
    const spending = new SpendingTracker(config.budget)
    registerPay(server, config, spending)

    const handler = extractToolHandler(server)
    await handler({
      amount: '0.05',
      recipient: '0xRecipient',
      network: 'sui-testnet'
    })

    const summary = spending.getSummary()
    expect(parseFloat(summary.spentSession)).toBe(0)
    expect(summary.recentPayments).toHaveLength(0)
  })
})
