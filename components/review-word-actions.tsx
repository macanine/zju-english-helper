'use client'

import * as React from 'react'
import { Button, Flex } from '@radix-ui/themes'
import { Star, Plus } from 'lucide-react'
import type { GameEngine } from '@/lib/engine'
import type { WordEntry } from '@/lib/model'
import type { WordOrigin } from '@/lib/review'

const EMPTY_ORIGINS: WordOrigin[] = []

export const ReviewWordActions = React.memo(function ReviewWordActions({ engine, word, favorite, inPlan, origins = EMPTY_ORIGINS }: {
  engine: GameEngine; word: WordEntry; favorite: boolean; inPlan: boolean; origins?: WordOrigin[]
}) {
  return <Flex gap="2" wrap="wrap">
    <Button size="2" variant="soft" color={favorite ? 'amber' : 'gray'}
      aria-label={`${favorite ? '取消收藏' : '收藏'} ${word.english}`} aria-pressed={favorite}
      onClick={() => engine.toggleFavorite(word, origins)}>
      <Star size={14} fill={favorite ? 'currentColor' : 'none'} />{favorite ? '已收藏' : '收藏'}
    </Button>
    {!inPlan && <Button size="2" variant="soft" onClick={() => engine.addToReview(word, origins)}>
      <Plus size={14} />加入复习
    </Button>}
  </Flex>
})
