import { afterAll, describe, expect, it } from 'vitest'
import {
  connectMessagingAccount,
  connectWithOnboarding,
  createMessagingRegistry,
  disconnectMessagingAccount,
  FakeMessagingAdapter,
  listConnectableChannels,
  listMessagingAccounts,
  PREFLIGHT_CHECK_IDS,
} from '../src/index.ts'
import { adminWithOrg, codeOf, db, joinMember } from './helpers.ts'

afterAll(async () => {
  await db.$disconnect()
})

const direct = new FakeMessagingAdapter('s3cret')
const guided = new FakeMessagingAdapter('s3cret', {
  channel: 'guided',
  onboarding: 'WHATSAPP_COEXISTENCE',
  canDisconnect: false,
})
const registry = createMessagingRegistry([direct, guided])
const all = [...PREFLIGHT_CHECK_IDS]
const none: string[] = []

describe('guided onboarding', () => {
  it('lists what can be connected and how', async () => {
    const admin = await adminWithOrg()
    expect(listConnectableChannels(admin.ctx, registry)).toEqual([
      { channel: 'fake', onboarding: 'DIRECT', canDisconnect: true, hasWebhookHandshake: false },
      {
        channel: 'guided',
        onboarding: 'WHATSAPP_COEXISTENCE',
        canDisconnect: false,
        hasWebhookHandshake: false,
      },
    ])
  })

  it('a guided channel cannot be connected in one step', async () => {
    const admin = await adminWithOrg()
    expect(
      await codeOf(connectMessagingAccount(admin.ctx, registry, { channel: 'guided' })),
    ).toEqual({
      code: 'CONFLICT',
      detail: 'ONBOARDING_REQUIRED',
    })
    expect(await listMessagingAccounts(admin.ctx)).toEqual([])
  })

  it('connects for the person themselves once every point is acknowledged', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    const account = await connectWithOnboarding(
      luis.ctx,
      registry,
      { channel: 'guided', path: 'COEXISTENCE', acknowledged: [...all, 'something-else'] },
      { unsupportedCountryCodes: [] },
    )
    expect(account).toMatchObject({ channel: 'guided', delegateId: luis.ctx.actor.memberId })
    expect(account).not.toHaveProperty('credentialsReference')
    // Others do not see Luis's account except the administrator.
    expect(await listMessagingAccounts(luis.ctx)).toHaveLength(1)
  })

  it('refuses a missing acknowledgement, naming which, and connects nothing', async () => {
    const admin = await adminWithOrg()
    const missing = all.filter((id) => id !== 'history')
    const rejected = connectWithOnboarding(
      admin.ctx,
      registry,
      { channel: 'guided', path: 'COEXISTENCE', acknowledged: missing },
      { unsupportedCountryCodes: [] },
    )
    expect(await codeOf(rejected)).toEqual({
      code: 'VALIDATION_FAILED',
      detail: 'PREFLIGHT_INCOMPLETE',
    })
    expect(
      await codeOf(
        connectWithOnboarding(
          admin.ctx,
          registry,
          { channel: 'guided', path: 'COEXISTENCE', acknowledged: none },
          { unsupportedCountryCodes: [] },
        ),
      ),
    ).toMatchObject({ code: 'VALIDATION_FAILED' })
    expect(await listMessagingAccounts(admin.ctx)).toEqual([])
  })

  it('only the available path, and only for a channel that declares the onboarding', async () => {
    const admin = await adminWithOrg()
    const base = { acknowledged: all }
    const opts = { unsupportedCountryCodes: [] }
    expect(
      await codeOf(
        connectWithOnboarding(
          admin.ctx,
          registry,
          { ...base, channel: 'guided', path: 'NEW_ACCOUNT' },
          opts,
        ),
      ),
    ).toEqual({ code: 'CONFLICT', detail: 'PATH_UNAVAILABLE' })
    expect(
      await codeOf(
        connectWithOnboarding(
          admin.ctx,
          registry,
          { ...base, channel: 'guided', path: 'NOPE' },
          opts,
        ),
      ),
    ).toEqual({ code: 'VALIDATION_FAILED', detail: 'UNKNOWN_PATH' })
    for (const channel of ['fake', 'missing']) {
      expect(
        await codeOf(
          connectWithOnboarding(
            admin.ctx,
            registry,
            { ...base, channel, path: 'COEXISTENCE' },
            opts,
          ),
        ),
      ).toEqual({ code: 'VALIDATION_FAILED', detail: 'UNKNOWN_CHANNEL' })
    }
  })

  it('checks the country only when a list is configured, and never guesses one', async () => {
    const admin = await adminWithOrg()
    const input = { channel: 'guided', path: 'COEXISTENCE', acknowledged: all }
    const listed = { unsupportedCountryCodes: ['XX'] }
    expect(await codeOf(connectWithOnboarding(admin.ctx, registry, input, listed))).toEqual({
      code: 'VALIDATION_FAILED',
      detail: 'COUNTRY_REQUIRED',
    })
    expect(
      await codeOf(
        connectWithOnboarding(admin.ctx, registry, { ...input, countryCode: 'xx' }, listed),
      ),
    ).toEqual({ code: 'CONFLICT', detail: 'COUNTRY_UNSUPPORTED' })
    const ok = await connectWithOnboarding(
      admin.ctx,
      registry,
      { ...input, countryCode: 'es' },
      listed,
    )
    expect(ok.status).toBe('CONNECTED')
  })

  it('a coexistence account cannot be disconnected from Kindly; a direct one can', async () => {
    const admin = await adminWithOrg()
    const guidedAccount = await connectWithOnboarding(
      admin.ctx,
      registry,
      { channel: 'guided', path: 'COEXISTENCE', acknowledged: all },
      { unsupportedCountryCodes: [] },
    )
    expect(await codeOf(disconnectMessagingAccount(admin.ctx, registry, guidedAccount.id))).toEqual(
      {
        code: 'CONFLICT',
        detail: 'CANNOT_DISCONNECT_FROM_KINDLY',
      },
    )
    const plain = await connectMessagingAccount(admin.ctx, registry, { channel: 'fake' })
    await disconnectMessagingAccount(admin.ctx, registry, plain.id)
    const after = await listMessagingAccounts(admin.ctx)
    expect(after.find((a) => a.id === plain.id)?.status).toBe('DISCONNECTED')
    expect(after.find((a) => a.id === guidedAccount.id)?.status).toBe('CONNECTED')
  })
})
