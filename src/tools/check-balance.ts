import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AppConfig } from '@/types.js'
import { getWalletAddress, getUsdcBalance } from '@/clients.js'

export function registerCheckBalance(
  server: McpServer,
  config: AppConfig
): void {
  server.tool(
    'check_balance',
    'Check wallet balances: USDC and native SUI for gas fees on Sui Testnet/Mainnet.',
    {},
    async () => {
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
        const address = await getWalletAddress(config.network, config)
        const usdcBalance = await getUsdcBalance(config.network, config)

        const result: Record<string, string | object> = {
          address,
          network: config.network,
          mode: config.mode,
          usdc: `${usdcBalance} USDC`
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2)
            }
          ]
        }
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error: ${err instanceof Error ? err.message : String(err)}`
            }
          ],
          isError: true
        }
      }
    }
  )
}
