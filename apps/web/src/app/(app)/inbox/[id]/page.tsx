import { redirect } from 'next/navigation'

/** Old links to a conversation (`/inbox/<id>`) open it in the inbox's panel. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/inbox?conversation=${encodeURIComponent(id)}`)
}
