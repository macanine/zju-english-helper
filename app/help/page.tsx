import type { Metadata } from 'next'
import { HelpView } from '@/components/help-view'

export const metadata: Metadata = { title: '帮助' }

export default function HelpPage() {
  return <HelpView />
}
