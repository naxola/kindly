import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { TasksList } from '@/features/tasks/tasks-list.tsx'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())('tasks.title') }
}

export default function Page() {
  return <TasksList />
}
