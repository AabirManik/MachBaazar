import type { Context } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { pool } from '../db/client.js'
import { users } from '../db/schema.js'
import { verifyDesktopPayRequest } from '../core/auth.js'
import { createX402Payment } from '../x402/create-payment.js'
import {
  parsePaymentRequirements,
  resolveSellerNetwork,
  getSellerAddress,
  getPaymentAmountAtomic
} from '../x402/parse-payment.js'
import {
  InsufficientBalanceError,
  UnsupportedNetworkError,
  toHttpException
} from '../core/errors.js'

// ─── Request / Response types ────────────────────────────────────────────────

interface HubPayRequest {
  correlationId: string
  sellerNetwork?: string
  paymentRequirements: unknown
  userContext: {
    algorandAddress: string
    maxDebitAtomic: string
  }
}

interface HubPayResponse {
  success: boolean
  paymentSignature?: string
  settlementNetwork?: string
  error?: string
}

// ─── Helper: get or create user + balance row ────────────────────────────────

async function getOrCreateUser(algorandAddr: string) {
  // Try to find existing user
  const existing = await db.query.users.findFirst({
    where: eq(users.algorandAddr, algorandAddr)
  })
  if (existing) return existing

  // Create user + balance in one transaction
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const userResult = await client.query<{ id: string }>(
      `INSERT INTO users (algorand_addr) VALUES ($1) 
       ON CONFLICT (algorand_addr) DO UPDATE SET algorand_addr = EXCLUDED.algorand_addr
       RETURNING id`,
      [algorandAddr]
    )
    const userId = userResult.rows[0].id
    await client.query(
      `INSERT INTO balances (user_id, balance_atomic) VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    )
    await client.query('COMMIT')
    return { id: userId, algorandAddr, createdAt: new Date() }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function payHandler(c: Context): Promise<Response> {
  const rawBody = await c.req.text()
  let body: HubPayRequest
  try {
    body = JSON.parse(rawBody) as HubPayRequest
  } catch {
    return c.json<HubPayResponse>(
      { success: false, error: 'Invalid JSON body' },
      400
    )
  }

  const { correlationId, paymentRequirements: rawReq, userContext } = body

  if (!correlationId || !rawReq || !userContext?.algorandAddress) {
    return c.json<HubPayResponse>(
      { success: false, error: 'Missing required fields' },
      400
    )
  }

  try {
    verifyDesktopPayRequest({
      headers: {
        authVersion: c.req.header('x-pixa-auth-version'),
        address: c.req.header('x-pixa-address'),
        timestamp: c.req.header('x-pixa-timestamp'),
        nonce: c.req.header('x-pixa-nonce'),
        bodySha256: c.req.header('x-pixa-body-sha256'),
        signature: c.req.header('x-pixa-signature')
      },
      rawBody,
      requestBody: body
    })

    // 1. Parse and validate the seller's 402 payload
    const payReq = parsePaymentRequirements(rawReq)
    const sellerNetwork = resolveSellerNetwork(payReq)
    if (!sellerNetwork)
      throw new UnsupportedNetworkError(
        `No supported network in paymentRequirements`
      )

    const sellerAddress = getSellerAddress(payReq, sellerNetwork)
    const amountAtomic = getPaymentAmountAtomic(payReq, sellerNetwork)

    // Respect user's max debit limit
    const maxDebit = BigInt(userContext.maxDebitAtomic)
    if (amountAtomic > maxDebit) {
      return c.json<HubPayResponse>(
        {
          success: false,
          error: `Amount ${amountAtomic} exceeds user maxDebitAtomic ${maxDebit}`
        },
        402
      )
    }

    // 2. Get or create user
    const user = await getOrCreateUser(userContext.algorandAddress)

    // ═══════════════════════════════════════════════════════
    // TRANSACTION 1 — Reserve: idempotency check + debit
    // ═══════════════════════════════════════════════════════
    const client = await pool.connect()
    const alreadyPaid = false
    const existingSignature: string | null = null

    try {
      await client.query('BEGIN')

      // Idempotency: try to insert payment attempt
      const insertResult = await client.query<{ id: string }>(
        `INSERT INTO payment_attempts (correlation_id, user_id, seller_network, seller_address, amount_atomic, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')
         ON CONFLICT (correlation_id) DO NOTHING
         RETURNING id`,
        [
          correlationId,
          user.id,
          sellerNetwork,
          sellerAddress,
          amountAtomic.toString()
        ]
      )

      if (insertResult.rows.length === 0) {
        // Row already exists — return existing result
        const existing = await client.query<{
          status: string
          payment_sig: string | null
          error_msg: string | null
          seller_network: string
        }>(
          `SELECT status, payment_sig, error_msg, seller_network 
           FROM payment_attempts WHERE correlation_id = $1`,
          [correlationId]
        )
        await client.query('COMMIT')

        const row = existing.rows[0]
        if (row?.status === 'paid' && row.payment_sig) {
          return c.json<HubPayResponse>({
            success: true,
            paymentSignature: row.payment_sig,
            settlementNetwork: row.seller_network
          })
        }
        if (row?.status === 'failed') {
          return c.json<HubPayResponse>(
            { success: false, error: row.error_msg ?? 'Payment failed' },
            402
          )
        }
        // Still 'pending' or 'paying' — rare race, let client retry
        return c.json<HubPayResponse>(
          { success: false, error: 'Payment in progress, retry shortly' },
          202
        )
      }

      // We own the row — check and debit balance
      const balanceResult = await client.query<{ balance_atomic: string }>(
        `SELECT balance_atomic FROM balances WHERE user_id = $1 FOR UPDATE`,
        [user.id]
      )
      const currentBalance = BigInt(
        balanceResult.rows[0]?.balance_atomic ?? '0'
      )

      if (currentBalance < amountAtomic) {
        // Rollback: delete the payment attempt row we just inserted
        await client.query(
          `DELETE FROM payment_attempts WHERE correlation_id = $1`,
          [correlationId]
        )
        await client.query('COMMIT')
        throw new InsufficientBalanceError(currentBalance, amountAtomic)
      }

      // Debit balance + mark as 'paying'
      await client.query(
        `UPDATE balances SET balance_atomic = balance_atomic - $1, updated_at = now() WHERE user_id = $2`,
        [amountAtomic.toString(), user.id]
      )
      await client.query(
        `UPDATE payment_attempts SET status = 'paying', updated_at = now() WHERE correlation_id = $1`,
        [correlationId]
      )
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      client.release()
      throw err
    }

    client.release()

    // ═══════════════════════════════════════════════════════
    // EXTERNAL CALL — Create x402 payment payload (outside TX)
    // ═══════════════════════════════════════════════════════
    let paymentSignature: string
    try {
      const result = await createX402Payment({
        paymentRequirements: payReq,
        sellerNetwork
      })
      paymentSignature = result.paymentSignature
    } catch (payErr) {
      // ════════════════════════════════════════════════════
      // TRANSACTION 2a — Failure: refund balance + mark failed
      // ════════════════════════════════════════════════════
      const rollbackClient = await pool.connect()
      try {
        await rollbackClient.query('BEGIN')
        await rollbackClient.query(
          `UPDATE balances SET balance_atomic = balance_atomic + $1, updated_at = now() WHERE user_id = $2`,
          [amountAtomic.toString(), user.id]
        )
        await rollbackClient.query(
          `UPDATE payment_attempts SET status = 'failed', error_msg = $1, updated_at = now() WHERE correlation_id = $2`,
          [(payErr as Error).message, correlationId]
        )
        await rollbackClient.query('COMMIT')
      } catch {
        await rollbackClient.query('ROLLBACK')
      } finally {
        rollbackClient.release()
      }
      throw payErr
    }

    // ═══════════════════════════════════════════════════════
    // TRANSACTION 2b — Success: mark paid + write audit logs
    // ═══════════════════════════════════════════════════════
    const settleClient = await pool.connect()
    try {
      await settleClient.query('BEGIN')
      await settleClient.query(
        `UPDATE payment_attempts 
         SET status = 'paid', payment_sig = $1, updated_at = now() 
         WHERE correlation_id = $2`,
        [paymentSignature, correlationId]
      )
      await settleClient.query(
        `INSERT INTO ledger_entries (user_id, amount_atomic, reason, ref_tx_id)
         VALUES ($1, $2, 'base_payment', $3)`,
        [user.id, (-amountAtomic).toString(), correlationId]
      )
      await settleClient.query(
        `INSERT INTO treasury_records (chain, correlation_id, amount_atomic, direction)
         VALUES ('base', $1, $2, 'payment_out')`,
        [correlationId, amountAtomic.toString()]
      )
      await settleClient.query('COMMIT')
    } catch (err) {
      await settleClient.query('ROLLBACK')
      // Payment was created but audit log failed — still return success
      // The payment_attempt row will be in 'paying' state for reconciliation
      console.error('[pay] Audit log failed after successful payment:', err)
    } finally {
      settleClient.release()
    }

    return c.json<HubPayResponse>({
      success: true,
      paymentSignature,
      settlementNetwork: sellerNetwork
    })
  } catch (err) {
    const httpErr = toHttpException(err)
    return c.json<HubPayResponse>(
      { success: false, error: httpErr.message },
      httpErr.status as 400 | 402 | 404 | 409 | 500
    )
  }
}
