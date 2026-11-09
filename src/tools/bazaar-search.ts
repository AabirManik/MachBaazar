/**
 * search_bazaar tool — query Unified Agent Layer for x402-gated AI services.
 * Lets the agent discover what AI tools / APIs are available to pay for.
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

const UNIFIED_LAYER_BASE =
  'https://unified-agent-layer-production.up.railway.app'

export function registerBazaarSearch(server: McpServer): void {
  server.tool(
    'search_bazaar',
    'Search the Unified Agent Layer to discover x402-gated AI services that agents can autonomously pay for. ' +
      'Returns available services including LLM chat, speech-to-text, text-to-speech, image generation, IPFS storage, code execution, HuggingFace inference, web search, and weather data.',
    {
      query: z
        .string()
        .optional()
        .describe(
          'Optional keyword to filter results (e.g. "chat", "image", "weather", "storage")'
        )
    },
    async ({ query }) => {
      try {
        const res = await fetch(UNIFIED_LAYER_BASE, {
          headers: { Accept: 'application/json' }
        })

        if (!res.ok) {
          throw new Error(
            `Unified Layer API returned ${res.status}: ${await res.text()}`
          )
        }

        const data = (await res.json()) as any

        // Parse endpoints into structured services
        const services = [
          {
            endpoint: `${UNIFIED_LAYER_BASE}/v1/chat`,
            method: 'POST',
            description:
              'LLM chat completions with auto-routing and explicit model selection',
            price: '$0.005',
            category: 'ai',
            tags: ['llm', 'chat', 'ai']
          },
          {
            endpoint: `${UNIFIED_LAYER_BASE}/v1/chat/models`,
            method: 'GET',
            description: 'List available chat models',
            price: 'Public',
            category: 'ai',
            tags: ['llm', 'chat', 'models']
          },
          {
            endpoint: `${UNIFIED_LAYER_BASE}/v1/stt`,
            method: 'POST',
            description: 'Speech-to-text transcription',
            price: '$0.010',
            category: 'ai',
            tags: ['speech', 'transcription', 'audio', 'stt']
          },
          {
            endpoint: `${UNIFIED_LAYER_BASE}/v1/tts`,
            method: 'POST',
            description: 'Text-to-speech generation',
            price: '$0.010',
            category: 'ai',
            tags: ['speech', 'audio', 'tts']
          },
          {
            endpoint: `${UNIFIED_LAYER_BASE}/v1/image`,
            method: 'POST',
            description: 'Image generation',
            price: '$0.050',
            category: 'ai',
            tags: ['image', 'generation', 'ai']
          },
          {
            endpoint: `${UNIFIED_LAYER_BASE}/v1/storage`,
            method: 'POST',
            description: 'IPFS storage',
            price: '$0.020',
            category: 'storage',
            tags: ['ipfs', 'storage', 'decentralized']
          },
          {
            endpoint: `${UNIFIED_LAYER_BASE}/v1/compute`,
            method: 'POST',
            description: 'Code execution',
            price: '$0.010',
            category: 'compute',
            tags: ['code', 'execution', 'compute']
          },
          {
            endpoint: `${UNIFIED_LAYER_BASE}/v1/hf`,
            method: 'POST',
            description: 'HuggingFace inference',
            price: '$0.030',
            category: 'ai',
            tags: ['huggingface', 'inference', 'ai', 'ml']
          },
          {
            endpoint: `${UNIFIED_LAYER_BASE}/v1/search`,
            method: 'POST',
            description: 'Web search',
            price: '$0.030',
            category: 'data',
            tags: ['search', 'web', 'data']
          },
          {
            endpoint: `${UNIFIED_LAYER_BASE}/v1/weather`,
            method: 'GET',
            description: 'Weather data + forecast',
            price: '$0.010',
            category: 'data',
            tags: ['weather', 'forecast', 'data']
          }
        ]

        // Filter by query if provided
        const filtered = query
          ? services.filter(service => {
              const haystack = JSON.stringify(service).toLowerCase()
              return haystack.includes(query.toLowerCase())
            })
          : services

        if (filtered.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `No services found matching "${query}" in the Unified Agent Layer.`
              }
            ]
          }
        }

        // Build a friendly message
        const serviceList = filtered
          .map(
            (s, i) =>
              `${i + 1}. ${s.description} - ${s.price}\n   Endpoint: ${s.method} ${s.endpoint}`
          )
          .join('\n\n')

        const message = query
          ? `Found ${filtered.length} service(s) matching "${query}":\n\n${serviceList}`
          : `Found ${filtered.length} available services:\n\n${serviceList}`

        const summary =
          `\n\n📋 Summary:\n` +
          `Network: ${data.network}\n` +
          `Facilitator: ${data.facilitator}\n` +
          `Payment Address: ${data.payTo}`

        return {
          content: [
            {
              type: 'text' as const,
              text: message + summary
            }
          ]
        }
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Unified Layer search failed: ${err instanceof Error ? err.message : String(err)}`
            }
          ],
          isError: true
        }
      }
    }
  )
}
