import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { TaskDetail } from '@/features/tasks/task-detail.tsx'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())('tasks.title') }
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <TaskDetail taskId={id} />
}
