import 'server-only'
import {
  findUserByAuthId,
  isDomainError,
  listMyOrganizations,
  resolveActor,
  type Permission,
} from '@saas/core'
import { cookies, headers } from 'next/headers'
import { cache } from 'react'
import { ACTIVE_ORG_COOKIE } from './api/session.ts'
import { auth } from './auth.ts'
import { db } from './db.ts'

/** Who is signed in (access layer, ADR 0003). */
export interface Viewer {
  authUserId: string
  email: string
  name: string
}

/** Session of the current request (RSC), memoized per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  // headers() first: it marks the page as dynamic before anything reads the environment,
  // so `next build` (Docker image, no runtime variables) never evaluates it.
  const requestHeaders = await headers()
  const result = await auth().api.getSession({ headers: requestHeaders })
  if (!result) return null
  return { authUserId: result.user.id, email: result.user.email, name: result.user.name }
})

export interface Workspace {
  viewer: Viewer
  /** Business user: null until the person enters the product. */
  user: { id: string; displayName: string; locale: string | null } | null
  organizations: { id: string; name: string; slug: string; role: 'ADMIN' | 'MEMBER' }[]
  /** Valid active organization (cookie or the only one) with the effective permissions. */
  active: {
    id: string
    name: string
    defaultLocale: string
    memberId: string
    permissions: Permission[]
  } | null
}

/**
 * Shell data. Only to paint navigation and choose the screen: security is always enforced
 * by the API in every use case.
 */
export const getWorkspace = cache(async (): Promise<Workspace | null> => {
  const viewer = await getViewer()
  if (!viewer) return null
  const user = await findUserByAuthId(db(), viewer.authUserId)
  if (!user) return { viewer, user: null, organizations: [], active: null }
  const organizations = await listMyOrganizations(db(), user.id)
  const chosen = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value
  const activeId = organizations.some((o) => o.id === chosen)
    ? chosen
    : organizations.length === 1
      ? organizations[0]!.id
      : undefined
  const base = {
    viewer,
    user: { id: user.id, displayName: user.displayName, locale: user.locale },
    organizations,
  }
  if (!activeId) return { ...base, active: null }
  try {
    const { actor, organization } = await resolveActor(db(), {
      userId: user.id,
      organizationId: activeId,
    })
    return {
      ...base,
      active: {
        id: activeId,
        name: organization.name,
        defaultLocale: organization.defaultLocale,
        memberId: actor.memberId,
        permissions: [...actor.permissions].sort(),
      },
    }
  } catch (error) {
    if (isDomainError(error) && error.code === 'NOT_FOUND') return { ...base, active: null }
    throw error
  }
})
