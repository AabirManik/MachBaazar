import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AppConfig, PaymentNetwork } from '@/types.js'
import type { SpendingTracker } from '@/spending.js'
import { createHttpClient, isSuiNetworkClient } from '@/clients.js'

interface PaymentRequiredBody {
  x402Version: number
  error: string
  resource: { url: string; description: string; mimeType: string }
  accepts: Array<{
    scheme: string
    network: string
    asset: string
    amount: string
    payTo: string
    maxTimeoutSeconds: number
    extra: Record<string, unknown>
  }>
}

function isLikelyTextContentType(contentType: string | null): boolean {
  if (!contentType) return false
  const normalized = contentType.toLowerCase()
  return (
    normalized.startsWith('text/') ||
    normalized.includes('application/json') ||
    normalized.includes('application/xml') ||
    normalized.includes('application/javascript') ||
    normalized.includes('application/x-www-form-urlencoded')
  )
}

async function formatResponseBody(response: Response): Promise<{
  body: string
  bodyEncoding: 'text' | 'base64'
  contentType: string | null
  contentLength: string | null
}> {
  const contentType = response.headers.get('content-type')
  const contentLength = response.headers.get('content-length')

  if (isLikelyTextContentType(contentType)) {
    return {
      body: await response.text(),
      bodyEncoding: 'text',
      contentType,
      contentLength
    }
  }

  const arrayBuffer = await response.arrayBuffer()
  return {
    body: Buffer.from(arrayBuffer).toString('base64'),
    bodyEncoding: 'base64',
    contentType,
    contentLength
  }
}

const CAIP2_TO_NETWORK: Record<string, PaymentNetwork> = {
  'sui:testnet': 'sui-testnet',
  'sui:mainnet': 'sui-mainnet'
}

function caip2ToNetwork(caip2: string): PaymentNetwork | undefined {
  return CAIP2_TO_NETWORK[caip2]
}

function atomicToUsdc(atomicAmount: string): string {
  // Sui USDC: 6 decimals
  const decimals = 6
  const raw = BigInt(atomicAmount)
  const whole = raw / BigInt(10 ** decimals)
  const frac = raw % BigInt(10 ** decimals)
  return `${whole}.${frac.toString().padStart(decimals, '0')}`
}

export function registerX402Fetch(
  server: McpServer,
  config: AppConfig,
  spending: SpendingTracker
): void {
  server.tool(
    'x402_fetch',
    'Fetch a URL with automatic x402 payment. Makes the HTTP request, and if the server responds with 402 Payment Required, attempts to sign the USDC payment and retry with the payment header. Returns the final response.',
    {
      url: z.string().url().describe('The URL to fetch'),
      method: z
        .enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])
        .default('GET')
        .describe('HTTP method (default: GET)'),
      headers: z
        .record(z.string())
        .optional()
        .describe('Optional HTTP headers as key-value pairs'),
      body: z.string().optional().describe('Optional request body')
    },
    async ({ url, method, headers, body }) => {
      if (!config.canPay) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No wallet configured. Set SUI_PRIVATE_KEY environment variable.'
            }
          ],
          isError: true
        }
      }

      try {
        // Step 1: Make the initial request
        const fetchOptions: RequestInit = {
          method,
          headers: headers ?? {}
        }
        if (body && method !== 'GET') {
          fetchOptions.body = body
        }

        const initialResponse = await fetch(url, fetchOptions)

        // If not 402, return the response directly
        if (initialResponse.status !== 402) {
          const responsePayload = await formatResponseBody(initialResponse)
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    status: initialResponse.status,
                    statusText: initialResponse.statusText,
                    body: responsePayload.body,
                    bodyEncoding: responsePayload.bodyEncoding,
                    contentType: responsePayload.contentType,
                    contentLength: responsePayload.contentLength
                  },
                  null,
                  2
                )
              }
            ]
          }
        }

        // Step 2: Parse the 402 Payment Required response
        let paymentRequired: PaymentRequiredBody

        const paymentRequiredHeader =
          initialResponse.headers.get('Payment-Required')

        if (paymentRequiredHeader) {
          const decoded = Buffer.from(paymentRequiredHeader, 'base64').toString(
            'utf-8'
          )
          paymentRequired = JSON.parse(decoded)
        } else {
          paymentRequired = await initialResponse.json()
        }

        if (!paymentRequired.accepts || paymentRequired.accepts.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Server returned 402 but no payment options were provided.'
              }
            ],
            isError: true
          }
        }

        // Step 3: Find a payment option we can fulfill
        const accept = paymentRequired.accepts.find(a => {
          const net = caip2ToNetwork(a.network)
          if (!net) return false
          if (isSuiNetworkClient(net) && config.canPaySui) return true
          return false
        })

        if (!accept) {
          const networks = paymentRequired.accepts
            .map(a => a.network)
            .join(', ')
          return {
            content: [
              {
                type: 'text' as const,
                text: `Cannot fulfill payment. Server accepts networks: [${networks}] but wallet is not configured for any of them.`
              }
            ],
            isError: true
          }
        }

        const network = caip2ToNetwork(accept.network)!
        const usdcAmount = atomicToUsdc(accept.amount)

        // Step 4: Check spending limits
        spending.check(usdcAmount)

        // Step 5: Sign the payment — Sui x402 scheme scheduled for Phase 3.
        // Until then this throws a clear placeholder error rather than a mock
        // settlement that could be mistaken for real payment.
        const httpClient = await createHttpClient(network, config)
        try {
          const payload = await httpClient.createPaymentPayload(paymentRequired)
          const signatureHeaders =
            httpClient.encodePaymentSignatureHeader(payload)

          // Step 6: Retry the request with the payment header
          const retryOptions: RequestInit = {
            method,
            headers: {
              ...(headers ?? {}),
              ...signatureHeaders
            }
          }
          if (body && method !== 'GET') {
            retryOptions.body = body
          }

          const paidResponse = await fetch(url, retryOptions)
          const responsePayload = await formatResponseBody(paidResponse)

          // Step 7: Record the spending
          spending.record(usdcAmount, accept.payTo, network)

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    status: paidResponse.status,
                    statusText: paidResponse.statusText,
                    body: responsePayload.body,
                    bodyEncoding: responsePayload.bodyEncoding,
                    contentType: responsePayload.contentType,
                    contentLength: responsePayload.contentLength,
                    payment: {
                      amount: `${usdcAmount} USDC`,
                      recipient: accept.payTo,
                      network
                    }
                  },
                  null,
                  2
                )
              }
            ]
          }
        } catch (paymentErr) {
          // Re-throw as a clear error so the caller knows Sui x402 isn't live yet.
          throw new Error(
            `Sui x402 payment scheme not yet implemented (Phase 3): ${paymentErr instanceof Error ? paymentErr.message : String(paymentErr)}`
          )
        }
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `x402 fetch failed: ${err instanceof Error ? err.message : String(err)}`
            }
          ],
          isError: true
        }
      }
    }
  )
}
