'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CircleAlert } from 'lucide-react'
import { Button, Card, Container, Flex, Heading, Text } from '@radix-ui/themes'
import { CardSkeleton } from '@/components/card-skeleton'
import { TypingArea } from '@/components/typing-area'
import { loadWords } from '@/lib/data'
import type { GameEngine } from '@/lib/engine'
import { useEngine } from '@/lib/hooks'
import { buildCards } from '@/lib/model'
import { decodeSession, encodeResult, type Session } from '@/lib/session'

async function startSession(engine: GameEngine, session: Session, key: string) {
  if (session.kind === 'review') {
    if (!engine.startReview(key)) throw new Error('错题本是空的，先完成一轮练习吧。')
    return
  }
  const words = await loadWords(session.bookId, session.units)
  if (words.length === 0) throw new Error('所选单元没有词条，请返回首页重新选择。')
  // 例句填空始终按释义出题：例句拆分后挂在各释义上，题面（句子）与提示（释义）天然配对
  const merge = session.options.questionMode === 'example' ? 'sense' : session.options.mergeMode
  if (engine.startSession(buildCards(words, merge), session.options, key) === 0) {
    throw new Error(
      '所选单元过滤后没有可练的词条（可能都被标记为「已掌握」），请换一组单元或改选「全部」。'
    )
  }
}

/** /practice：URL 查询串就是会话定义 —— 刷新可恢复、链接可分享 */
export function PracticeView() {
  const router = useRouter()
  const query = useSearchParams().toString()
  const session = React.useMemo(() => decodeSession(query), [query])
  const engine = useEngine()
  const [error, setError] = React.useState<string | null>(null)
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    if (!engine) return
    if (!session) {
      setError('练习链接不完整，请返回首页重新选择词库。')
      return
    }
    // 会话已在引擎里且有未答的题（浏览器前进/后退回到本页）→ 直接续做
    if (engine.isActive(query)) {
      setReady(true)
      return
    }
    let cancelled = false
    setReady(false)
    setError(null)
    startSession(engine, session, query)
      .then(() => {
        if (!cancelled) setReady(true)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [engine, session, query])

  if (error) {
    return (
      <Container size="3" px="4" py="6">
        <Card size={{ initial: '2', sm: '3' }} className="anim-in-up">
          <Flex direction="column" align="center" gap="4" py="6">
            <CircleAlert size={40} strokeWidth={1.5} style={{ color: 'var(--red-9)' }} />
            <Heading as="h2" size="4">
              无法开始练习
            </Heading>
            <Text size="2" color="gray" align="center">
              {error}
            </Text>
            <Button variant="soft" onClick={() => router.push('/')}>
              返回首页
            </Button>
          </Flex>
        </Card>
      </Container>
    )
  }

  if (!ready || !engine || !session) {
    return (
      <Container size="3" px="4" py="6">
        <CardSkeleton />
      </Container>
    )
  }

  return (
    <TypingArea
      key={query}
      engine={engine}
      session={session}
      onExit={() => router.push('/')}
      onFinish={(stats) => router.replace(`/result?${encodeResult(session, stats)}`)}
    />
  )
}
