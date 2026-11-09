import { describe, it, expect } from 'vitest'
import { isSuiNetworkClient, getCaip2Network } from '../src/clients.js'

describe('network helpers', () => {
  describe('isSuiNetworkClient', () => {
    it('returns true for sui-testnet', () => {
      expect(isSuiNetworkClient('sui-testnet')).toBe(true)
    })

    it('returns true for sui-mainnet', () => {
      expect(isSuiNetworkClient('sui-mainnet')).toBe(true)
    })
  })

  describe('getCaip2Network', () => {
    it('maps sui-testnet to sui:testnet', () => {
      expect(getCaip2Network('sui-testnet')).toBe('sui:testnet')
    })

    it('maps sui-mainnet to sui:mainnet', () => {
      expect(getCaip2Network('sui-mainnet')).toBe('sui:mainnet')
    })
  })
})
