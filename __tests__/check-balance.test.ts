import { describe, it, expect, vi, beforeEach } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AppConfig } from '../src/types.js'
import { registerCheckBalance } from '../src/tools/check-balance.js'

vi.mock('../src/clients.js', () => ({
  getWalletAddress: vi.fn(),
  getUsdcBalance: vi.fn()
}))

import { getWalletAddress, getUsdcBalance } from '../src/clients.js'

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

// Extract the tool handler from McpServer
function extractToolHandler(
  server: McpServer
): (...args: unknown[]) => Promise<unknown> {
  const calls = vi.mocked(server.tool).mock.calls
  const call = calls.find(c => c[0] === 'check_balance')
  return call![call!.length - 1] as (...args: unknown[]) => Promise<unknown>
}

describe('check_balance tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers the tool with correct name', () => {
    const server = { tool: vi.fn() } as unknown as McpServer
    const config = makeConfig()
    registerCheckBalance(server, config)
    expect(server.tool).toHaveBeenCalledWith(
      'check_balance',
      expect.any(String),
      expect.any(Object),
      expect.any(Function)
    )
  })

  it('returns error when no wallet configured', async () => {
    const server = { tool: vi.fn() } as unknown as McpServer
    const config = makeConfig({ canPay: false })
    registerCheckBalance(server, config)

    const handler = extractToolHandler(server)
    const result = (await handler({})) as {
      isError: boolean
      content: { text: string }[]
    }

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('No wallet configured')
  })

  it('returns balance and address on success', async () => {
    vi.mocked(getWalletAddress).mockResolvedValue('0xRecipient')
    vi.mocked(getUsdcBalance).mockResolvedValue('100.500000')

    const server = { tool: vi.fn() } as unknown as McpServer
    const config = makeConfig({
      canPay: true,
      canPaySui: true,
      suiPrivateKey: 'suiprivkey1...',
      mode: 'FULL',
      network: 'sui-testnet'
    })
    registerCheckBalance(server, config)

    const handler = extractToolHandler(server)
    const result = (await handler({})) as { content: { text: string }[] }

    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.address).toBe('0xRecipient')
    expect(parsed.usdc).toBe('100.500000 USDC')
    expect(parsed.network).toBe('sui-testnet')
    expect(parsed.mode).toBe('FULL')
  })

  it('returns error when balance fetch fails', async () => {
    vi.mocked(getWalletAddress).mockRejectedValue(new Error('RPC timeout'))

    const server = { tool: vi.fn() } as unknown as McpServer
    const config = makeConfig({
      canPay: true,
      canPaySui: true,
      suiPrivateKey: 'suiprivkey1...',
      mode: 'FULL'
    })
    registerCheckBalance(server, config)

    const handler = extractToolHandler(server)
    const result = (await handler({})) as {
      isError: boolean
      content: { text: string }[]
    }

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('RPC timeout')
  })
})
