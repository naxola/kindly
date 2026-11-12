import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { AppFrame } from '@/components/app-frame.tsx'
import { getWorkspace } from '@/server/viewer.ts'

/**
 * Application shell: requires a session and an active organization. Permissions only
 * filter navigation; security is enforced by the API in every use case.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const workspace = await getWorkspace()
  if (!workspace) redirect('/sign-in')
  if (!workspace.user || !workspace.active) redirect('/onboarding')
  return (
    <AppFrame
      user={{
        id: workspace.user.id,
        memberId: workspace.active.memberId,
        name: workspace.user.displayName,
        email: workspace.viewer.email,
      }}
      organizations={workspace.organizations.map((o) => ({ id: o.id, name: o.name }))}
      active={{ id: workspace.active.id, name: workspace.active.name }}
      permissions={workspace.active.permissions}
    >
      {children}
    </AppFrame>
  )
}
