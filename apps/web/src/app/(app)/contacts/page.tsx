import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { ContactsList } from '@/features/contacts/contacts-list.tsx'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())('contacts.title') }
}

export default function Page() {
  return <ContactsList />
}
