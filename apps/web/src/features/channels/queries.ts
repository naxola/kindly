'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/client/api.ts'
import { unwrap } from '@/client/errors.ts'

export const channelKeys = {
  all: (orgId: string) => ['org', orgId, 'channels'] as const,
}

/** The accounts the person may see, the channels available here and the onboarding rules. */
export function useChannels(orgId: string) {
  return useQuery({
    queryKey: channelKeys.all(orgId),
    queryFn: async () => unwrap(await apiClient.GET('/api/v1/channels')),
  })
}

export type ChannelsData = NonNullable<ReturnType<typeof useChannels>['data']>
export type ChannelAccount = ChannelsData['accounts'][number]
