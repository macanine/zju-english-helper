import type { Metadata } from 'next'
import { WrongWordsView } from '@/components/wrong-words-view'

export const metadata: Metadata = { title: '复习本' }

export default function WrongWordsPage() {
  return <WrongWordsView />
}
