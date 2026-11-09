import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AppConfig } from '@/types.js'
import type { SpendingTracker } from '@/spending.js'
import { isSuiNetworkClient } from '@/clients.js'
import type { PaymentNetwork } from '@/types.js'

export function registerPay(
  server: McpServer,
  config: AppConfig,
  spending: SpendingTracker
): void {
  server.tool(
    'pay',
    'Sign and create an x402 payment header (USDC transfer authorization). Returns the payment header value to attach to your HTTP request.',
    {
      amount: z.string().describe('USDC amount as decimal string, e.g. "0.05"'),
      recipient: z.string().describe('Recipient Sui address'),
      network: z
        .enum(['sui-testnet', 'sui-mainnet'])
        .describe('Payment network'),
      resource: z
        .string()
        .optional()
        .describe('URL of the resource being paid for')
    },
    async ({
      amount,
      network
    }: {
      amount: string
      network: PaymentNetwork
    }) => {
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

      const net = network as PaymentNetwork

      if (isSuiNetworkClient(net) && !config.canPaySui) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Sui key not configured. Set SUI_PRIVATE_KEY to pay on Sui.'
            }
          ],
          isError: true
        }
      }

      try {
        spending.check(amount)

        // Sui x402 payment scheme is scheduled for Phase 3.
        // Until then, pay() on Sui networks returns a clear placeholder error
        // rather than a mock settlement that could be mistaken for real payment.
        throw new Error(
          'Sui x402 payment scheme not yet implemented — scheduled for Phase 3. ' +
            'Use check_balance for Sui balance reads in the meantime.'
        )
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Payment failed: ${err instanceof Error ? err.message : String(err)}`
            }
          ],
          isError: true
        }
      }
    }
  )
}
