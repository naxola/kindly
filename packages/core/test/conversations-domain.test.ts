import { describe, expect, it } from 'vitest'
import {
  describeAccountStatus,
  getServiceWindowState,
  isConversationUnread,
  shouldApplyDeliveryStatus,
} from '../src/index.ts'

const d = (iso: string) => new Date(iso)

describe('isConversationUnread', () => {
  it('is never unread without messages', () => {
    expect(isConversationUnread(null, null)).toBe(false)
  })
  it('is unread when it was never opened, or the last message is newer than the last read', () => {
    expect(isConversationUnread(d('2026-01-02'), null)).toBe(true)
    expect(isConversationUnread(d('2026-01-02'), d('2026-01-01'))).toBe(true)
    expect(isConversationUnread(d('2026-01-01'), d('2026-01-02'))).toBe(false)
    expect(isConversationUnread(d('2026-01-01'), d('2026-01-01'))).toBe(false)
  })
})

describe('getServiceWindowState', () => {
  const now = d('2026-05-02T12:00:00Z')
  it('does not apply to a channel without a window', () => {
    expect(getServiceWindowState(d('2026-05-02T11:00:00Z'), null, now).status).toBe(
      'NOT_APPLICABLE',
    )
  })
  it('is closed if the contact never wrote', () => {
    expect(getServiceWindowState(null, 24, now)).toEqual({ status: 'CLOSED', expiresAt: null })
  })
  it('is open for 24 h after the last INBOUND message and closed after', () => {
    const open = getServiceWindowState(d('2026-05-01T13:00:00Z'), 24, now)
    expect(open.status).toBe('OPEN')
    expect(open.expiresAt?.toISOString()).toBe('2026-05-02T13:00:00.000Z')
    expect(getServiceWindowState(d('2026-05-01T11:59:00Z'), 24, now).status).toBe('CLOSED')
  })
})

describe('shouldApplyDeliveryStatus', () => {
  it('moves forward but never backwards', () => {
    expect(shouldApplyDeliveryStatus('SENT', 'DELIVERED')).toBe(true)
    expect(shouldApplyDeliveryStatus('DELIVERED', 'READ')).toBe(true)
    expect(shouldApplyDeliveryStatus('READ', 'DELIVERED')).toBe(false)
    expect(shouldApplyDeliveryStatus('DELIVERED', 'DELIVERED')).toBe(false)
  })
  it('FAILED only overrides what had not reached the phone, and loses to a later delivery', () => {
    expect(shouldApplyDeliveryStatus('PENDING', 'FAILED')).toBe(true)
    expect(shouldApplyDeliveryStatus('SENT', 'FAILED')).toBe(true)
    expect(shouldApplyDeliveryStatus('DELIVERED', 'FAILED')).toBe(false)
    expect(shouldApplyDeliveryStatus('FAILED', 'DELIVERED')).toBe(true)
    expect(shouldApplyDeliveryStatus('FAILED', 'SENT')).toBe(false)
  })
})

describe('describeAccountStatus', () => {
  it('tells apart what flows from what needs a person', () => {
    expect(describeAccountStatus('CONNECTED')).toEqual({
      tone: 'ok',
      needsAttention: false,
      operational: true,
    })
    expect(describeAccountStatus('DEGRADED')).toMatchObject({
      needsAttention: true,
      operational: true,
    })
    expect(describeAccountStatus('REVOKED')).toMatchObject({
      needsAttention: true,
      operational: false,
    })
    expect(describeAccountStatus('DISCONNECTED')).toMatchObject({
      needsAttention: false,
      operational: false,
    })
    expect(describeAccountStatus('PENDING').tone).toBe('pending')
  })
})
