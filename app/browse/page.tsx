import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Container } from '@radix-ui/themes'
import { CardSkeleton } from '@/components/card-skeleton'
import { BrowseView } from '@/components/browse-view'

export const metadata: Metadata = { title: '预习' }

export default function BrowsePage() {
  return (
    <Suspense
      fallback={
        <Container size="3" px="4" py="6">
          <CardSkeleton />
        </Container>
      }
    >
      <BrowseView />
    </Suspense>
  )
}
