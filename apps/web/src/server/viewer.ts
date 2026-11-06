import 'server-only'
import { headers } from 'next/headers'
import { cache } from 'react'
import { auth } from './auth.ts'

/** Who is signed in (access layer). Business identity joins in phase 4b. */
export interface Viewer {
  authUserId: string
  email: string
  name: string
}

/** Session of the current request (RSC), memoized per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const result = await auth().api.getSession({ headers: await headers() })
  if (!result) return null
  return { authUserId: result.user.id, email: result.user.email, name: result.user.name }
})
