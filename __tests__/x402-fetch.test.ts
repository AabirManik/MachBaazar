import { describe, it, expect, vi, beforeEach } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AppConfig } from '../src/types.js'
import { SpendingTracker } from '../src/spending.js'
import { registerX402Fetch } from '../src/tools/x402-fetch.js'

vi.mock('../src/clients.js', () => ({
  createHttpClient: vi.fn(),
  isSuiNetworkClient: vi.fn((net: string) => net.startsWith('sui'))
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

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
  const call = calls.find(c => c[0] === 'x402_fetch')
  return call![call!.length - 1] as (...args: unknown[]) => Promise<unknown>
}

describe('x402_fetch tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
  })

  it('registers the tool with correct name', () => {
    const server = { tool: vi.fn() } as unknown as McpServer
    const config = makeConfig()
    const spending = new SpendingTracker(config.budget)
    registerX402Fetch(server, config, spending)
    expect(server.tool).toHaveBeenCalledWith(
      'x402_fetch',
      expect.any(String),
      expect.any(Object),
      expect.any(Function)
    )
  })

  it('returns error when no wallet configured', async () => {
    const server = { tool: vi.fn() } as unknown as McpServer
    const config = makeConfig({ canPay: false })
    const spending = new SpendingTracker(config.budget)
    registerX402Fetch(server, config, spending)

    const handler = extractToolHandler(server)
    const result = (await handler({
      url: 'https://api.example.com/data',
      method: 'GET'
    })) as { isError: boolean; content: { text: string }[] }

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('No wallet configured')
  })

  it('returns response directly when status is not 402', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: { get: () => 'application/json' },
      text: vi.fn().mockResolvedValue('{"result":"success"}')
    })

    const server = { tool: vi.fn() } as unknown as McpServer
    const config = makeConfig({
      canPay: true,
      canPaySui: true,
      suiPrivateKey: 'suiprivkey1...',
      mode: 'FULL'
    })
    const spending = new SpendingTracker(config.budget)
    registerX402Fetch(server, config, spending)

    const handler = extractToolHandler(server)
    const result = (await handler({
      url: 'https://api.example.com/data',
      method: 'GET'
    })) as { content: { text: string }[] }

    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.status).toBe(200)
    expect(parsed.body).toBe('{"result":"success"}')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('handles 402 and returns error when Sui x402 scheme not implemented', async () => {
    const paymentRequiredBody = {
      x402Version: 2,
      error: '',
      resource: { url: '', description: '', mimeType: '' },
      accepts: [
        {
          scheme: 'exact',
          network: 'sui:testnet',
          asset:
            '0x458a2181e2f5022f084e2ec9b73b8cfd0bc1b709f499a2dcd0e93e39b694c4::usdc::USDC',
          amount: '50000',
          payTo: '0xRecipient',
          maxTimeoutSeconds: 300,
          extra: {}
        }
      ]
    }

    // First call returns 402
    mockFetch.mockResolvedValueOnce({
      status: 402,
      statusText: 'Payment Required',
      headers: { get: () => null },
      json: vi.fn().mockResolvedValue(paymentRequiredBody)
    })

    const server = { tool: vi.fn() } as unknown as McpServer
    const config = makeConfig({
      canPay: true,
      canPaySui: true,
      suiPrivateKey: 'suiprivkey1...',
      mode: 'FULL'
    })
    const spending = new SpendingTracker(config.budget)
    registerX402Fetch(server, config, spending)

    const handler = extractToolHandler(server)
    const result = (await handler({
      url: 'https://api.example.com/paid',
      method: 'GET'
    })) as { isError: boolean; content: { text: string }[] }

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('not yet implemented')
    expect(result.content[0].text).toContain('Phase 3')
  })

  it('returns error when 402 has no accepts', async () => {
    mockFetch.mockResolvedValue({
      status: 402,
      statusText: 'Payment Required',
      headers: { get: () => null },
      json: vi.fn().mockResolvedValue({
        x402Version: 2,
        error: '',
        resource: { url: '', description: '', mimeType: '' },
        accepts: []
      })
    })

    const server = { tool: vi.fn() } as unknown as McpServer
    const config = makeConfig({
      canPay: true,
      canPaySui: true,
      suiPrivateKey: 'suiprivkey1...',
      mode: 'FULL'
    })
    const spending = new SpendingTracker(config.budget)
    registerX402Fetch(server, config, spending)

    const handler = extractToolHandler(server)
    const result = (await handler({
      url: 'https://api.example.com/paid',
      method: 'GET'
    })) as { isError: boolean; content: { text: string }[] }

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('no payment options were provided')
  })

  it('returns error when wallet cannot fulfill any accepted network', async () => {
    const paymentRequiredBody = {
      x402Version: 2,
      error: '',
      resource: { url: '', description: '', mimeType: '' },
      accepts: [
        {
          scheme: 'exact',
          network: 'stellar:testnet',
          asset: 'CBIELTK6...',
          amount: '500000',
          payTo: 'GABC...',
          maxTimeoutSeconds: 300,
          extra: {}
        }
      ]
    }

    mockFetch.mockResolvedValue({
      status: 402,
      statusText: 'Payment Required',
      headers: { get: () => null },
      json: vi.fn().mockResolvedValue(paymentRequiredBody)
    })

    const server = { tool: vi.fn() } as unknown as McpServer
    const config = makeConfig({
      canPay: true,
      canPaySui: true,
      suiPrivateKey: 'suiprivkey1...',
      mode: 'FULL'
    })
    const spending = new SpendingTracker(config.budget)
    registerX402Fetch(server, config, spending)

    const handler = extractToolHandler(server)
    const result = (await handler({
      url: 'https://api.example.com/paid',
      method: 'GET'
    })) as { isError: boolean; content: { text: string }[] }

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Cannot fulfill payment')
  })

  it('handles fetch network errors gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('DNS resolution failed'))

    const server = { tool: vi.fn() } as unknown as McpServer
    const config = makeConfig({
      canPay: true,
      canPaySui: true,
      suiPrivateKey: 'suiprivkey1...',
      mode: 'FULL'
    })
    const spending = new SpendingTracker(config.budget)
    registerX402Fetch(server, config, spending)

    const handler = extractToolHandler(server)
    const result = (await handler({
      url: 'https://nonexistent.example.com/data',
      method: 'GET'
    })) as { isError: boolean; content: { text: string }[] }

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('DNS resolution failed')
  })
})
