import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Container } from '@radix-ui/themes'
import { CardSkeleton } from '@/components/card-skeleton'
import { PracticeView } from '@/components/practice-view'

export const metadata: Metadata = { title: '练习' }

export default function PracticePage() {
  return (
    <Suspense
      fallback={
        <Container size="3" px="4" py="6">
          <CardSkeleton />
        </Container>
      }
    >
      <PracticeView />
    </Suspense>
  )
}
