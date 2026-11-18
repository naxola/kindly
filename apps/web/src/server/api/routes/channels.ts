import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  connectMessagingAccount,
  connectWithOnboarding,
  describeAccountStatus,
  disconnectMessagingAccount,
  listConnectableChannels,
  listMessagingAccounts,
  ONBOARDING_PATHS,
  PREFLIGHT_CHECK_IDS,
  type MessagingAccountView,
} from '@saas/core'
import { messaging, unsupportedCountryCodes } from '../../messaging.ts'
import { cookieAuth, errorResponses, IdParam } from '../openapi.ts'
import { actorCtx } from '../session.ts'
import type { ApiEnv } from '../types.ts'
import { json } from './schemas.ts'

/**
 * Channels: the messaging accounts of the delegates. Each person connects their OWN accounts (never
 * on someone else's behalf); administrators see all of them and may disconnect any. The account
 * never exposes the pointer to its credentials nor the provider's metadata.
 */

const AccountSchema = z
  .object({
    id: z.uuid(),
    channel: z.string(),
    delegateId: z.uuid(),
    delegateName: z.string(),
    displayName: z.string().nullable(),
    phone: z.string().nullable(),
    status: z.enum([
      'PENDING',
      'CONNECTING',
      'CONNECTED',
      'DEGRADED',
      'DISCONNECTED',
      'REVOKED',
      'ERROR',
    ]),
    /** What the status means for the person looking at it (computed by the server). */
    tone: z.enum(['ok', 'pending', 'warning', 'error', 'inactive']),
    needsAttention: z.boolean(),
    lastError: z.string().nullable(),
    connectedAt: z.iso.datetime().nullable(),
    lastSyncAt: z.iso.datetime().nullable(),
    /** Whether Kindly can end the connection, or only the delegate from their own device. */
    canDisconnect: z.boolean(),
    /** Path to register in the provider's panel, for providers with a subscription handshake. */
    webhookPath: z.string().nullable(),
  })
  .openapi('ChannelAccount')

const ChannelSchema = z
  .object({
    channel: z.string(),
    onboarding: z.enum(['DIRECT', 'WHATSAPP_COEXISTENCE']),
    canDisconnect: z.boolean(),
  })
  .openapi('Channel')

const OnboardingSchema = z
  .object({
    paths: z.array(z.object({ id: z.string(), available: z.boolean() })),
    checks: z.array(z.string()).describe('Ids the delegate must acknowledge, in order'),
    /** False when no list of unsupported countries is configured: the country cannot be checked. */
    countryCheckAvailable: z.boolean(),
  })
  .openapi('ChannelOnboarding')

const list = createRoute({
  method: 'get',
  path: '/channels',
  tags: ['channels'],
  summary:
    'Accounts the person may see (their own; administrators: all) and the channels available',
  security: cookieAuth,
  responses: {
    200: {
      description: 'Accounts and channels',
      ...json(
        z.object({
          accounts: z.array(AccountSchema),
          channels: z.array(ChannelSchema),
          onboarding: OnboardingSchema,
        }),
      ),
    },
    ...errorResponses(401, 403),
  },
})

const connect = createRoute({
  method: 'post',
  path: '/channels/accounts',
  tags: ['channels'],
  summary:
    'Connect an account of the person in one step (409 ONBOARDING_REQUIRED for guided channels)',
  security: cookieAuth,
  request: {
    body: { required: true, ...json(z.object({ channel: z.string().min(1).max(60) })) },
  },
  responses: {
    201: { description: 'Connected', ...json(AccountSchema) },
    ...errorResponses(400, 401, 403, 409),
  },
})

const onboard = createRoute({
  method: 'post',
  path: '/channels/accounts/onboarding',
  tags: ['channels'],
  summary:
    'Connect through the guided onboarding: the path, every acknowledgement and (if it can be checked) the country',
  security: cookieAuth,
  request: {
    body: {
      required: true,
      ...json(
        z.object({
          channel: z.string().min(1).max(60),
          path: z.string().min(1).max(40),
          acknowledged: z.array(z.string().max(60)).max(20),
          countryCode: z.string().max(2).nullish(),
        }),
      ),
    },
  },
  responses: {
    201: { description: 'Connected', ...json(AccountSchema) },
    ...errorResponses(400, 401, 403, 409),
  },
})

const disconnect = createRoute({
  method: 'post',
  path: '/channels/accounts/{id}/disconnect',
  tags: ['channels'],
  summary:
    'Disconnect an account (own; administrators any). 409 CANNOT_DISCONNECT_FROM_KINDLY when only the device can',
  security: cookieAuth,
  request: { params: IdParam },
  responses: { 204: { description: 'Disconnected' }, ...errorResponses(401, 403, 404, 409) },
})

const toAccount = (a: MessagingAccountView, canDisconnect: boolean) => {
  const d = describeAccountStatus(a.status)
  return {
    id: a.id,
    channel: a.channel,
    delegateId: a.delegateId,
    delegateName: a.delegateName,
    displayName: a.displayName,
    phone: a.phone,
    status: a.status,
    tone: d.tone,
    needsAttention: d.needsAttention,
    lastError: a.lastError,
    connectedAt: a.connectedAt?.toISOString() ?? null,
    lastSyncAt: a.lastSyncAt?.toISOString() ?? null,
    canDisconnect,
    webhookPath: null as string | null,
  }
}

export const channelRoutes = new OpenAPIHono<ApiEnv>()
  .openapi(list, async (c) => {
    const ctx = await actorCtx(c)
    const channels = listConnectableChannels(ctx, messaging())
    const byChannel = new Map(channels.map((x) => [x.channel, x]))
    const accounts = (await listMessagingAccounts(ctx)).map((a) => ({
      ...toAccount(a, byChannel.get(a.channel)?.canDisconnect ?? false),
      webhookPath:
        a.status !== 'DISCONNECTED' && byChannel.get(a.channel)?.hasWebhookHandshake
          ? `/api/webhooks/messaging/${a.channel}/${a.id}`
          : null,
    }))
    return c.json(
      {
        accounts,
        channels: channels.map(({ channel, onboarding, canDisconnect }) => ({
          channel,
          onboarding,
          canDisconnect,
        })),
        onboarding: {
          paths: ONBOARDING_PATHS.map((p) => ({ id: p.id, available: p.available })),
          checks: [...PREFLIGHT_CHECK_IDS],
          countryCheckAvailable: unsupportedCountryCodes().length > 0,
        },
      },
      200,
    )
  })
  .openapi(connect, async (c) => {
    const a = await connectMessagingAccount(await actorCtx(c), messaging(), c.req.valid('json'))
    return c.json(toAccount(a, true), 201)
  })
  .openapi(onboard, async (c) => {
    const a = await connectWithOnboarding(await actorCtx(c), messaging(), c.req.valid('json'), {
      unsupportedCountryCodes: unsupportedCountryCodes(),
    })
    return c.json(toAccount(a, false), 201)
  })
  .openapi(disconnect, async (c) => {
    await disconnectMessagingAccount(await actorCtx(c), messaging(), c.req.valid('param').id)
    return c.body(null, 204)
  })
