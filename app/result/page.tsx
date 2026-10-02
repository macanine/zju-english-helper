import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Container } from '@radix-ui/themes'
import { CardSkeleton } from '@/components/card-skeleton'
import { ResultView } from '@/components/result-view'

export const metadata: Metadata = { title: '本轮结果' }

export default function ResultPage() {
  return (
    <Suspense
      fallback={
        <Container size="3" px="4" py="6">
          <CardSkeleton />
        </Container>
      }
    >
      <ResultView />
    </Suspense>
  )
}
