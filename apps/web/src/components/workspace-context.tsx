'use client'

import { createContext, useContext, type ReactNode } from 'react'

interface WorkspaceValue {
  organizationId: string
  userId: string
  memberId: string
  permissions: readonly string[]
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null)

export function WorkspaceProvider({
  value,
  children,
}: {
  value: WorkspaceValue
  children: ReactNode
}) {
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

/** Permissions in the active organization, to show or hide actions (not security). */
export function useCan() {
  const ctx = useContext(WorkspaceContext)
  return (...anyOf: string[]) => !!ctx && anyOf.some((p) => ctx.permissions.includes(p))
}

export function useUserId() {
  return useContext(WorkspaceContext)?.userId ?? null
}

export function useMemberId() {
  return useContext(WorkspaceContext)?.memberId ?? null
}

export function useOrganizationId() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useOrganizationId outside WorkspaceProvider')
  return ctx.organizationId
}
