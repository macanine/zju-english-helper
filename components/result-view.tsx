'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2, NotebookText, RotateCcw, Settings2 } from 'lucide-react'
import { Box, Button, Card, Container, Flex, Heading, Text } from '@radix-ui/themes'
import { CardSkeleton } from '@/components/card-skeleton'
import { useWrongBook } from '@/lib/hooks'
import { decodeResult, encodeSession } from '@/lib/session'

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  return m > 0 ? `${m} 分 ${s % 60} 秒` : `${s} 秒`
}

/** 单个统计值：窄屏一行（值左、标签右），sm 起变成居中的三宫格 */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <Flex
      direction={{ initial: 'row', sm: 'column' }}
      align="center"
      justify={{ initial: 'between', sm: 'center' }}
      gap="1"
      p="3"
      className="rounded-xl bg-[var(--gray-a2)]"
    >
      <Text size="5" weight="medium" className="tabular-nums" style={{ overflowWrap: 'anywhere' }}>
        {value}
      </Text>
      <Text size="2" color="gray" className="whitespace-nowrap">
        {label}
      </Text>
    </Flex>
  )
}

/** /result：本轮成绩；统计值随会话参数一起放在 URL 里，刷新/前进后退都不会丢 */
export function ResultView() {
  const router = useRouter()
  const query = useSearchParams().toString()
  const result = React.useMemo(() => decodeResult(query), [query])
  const { words } = useWrongBook()

  React.useEffect(() => {
    if (!result) router.replace('/')
  }, [result, router])

  if (!result) {
    return (
      <Container size="3" px="4" py="6">
        <CardSkeleton />
      </Container>
    )
  }

  const { session, stats } = result
  const isReview = session.kind === 'review'
  const accuracy = Math.round((stats.firstTryCorrect / stats.total) * 100)

  return (
    <Container size="3" px="4" py="6">
      <Card size={{ initial: '2', sm: '3' }} className="anim-in-up">
        <Flex direction="column" align="center" gap="5" py="4">
          <CheckCircle2
            size={56}
            strokeWidth={1.5}
            className="anim-pop"
            style={{ color: 'var(--green-9)' }}
          />

          <Flex direction="column" align="center" gap="1">
            <Heading as="h2" size="5">
              {isReview ? '复习完成！' : '本轮练习完成！'}
            </Heading>
          </Flex>

          <Box className="w-full max-w-sm">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat value={String(stats.total)} label="完成词数" />
              <Stat value={`${accuracy}%`} label="首次正确率" />
              <Stat value={formatDuration(stats.durationMs)} label="用时" />
            </div>
          </Box>

          <Flex direction="column" gap="3" className="w-full max-w-sm">
            {!isReview && (
              <Button
                size="3"
                className="w-full"
                onClick={() => router.push(`/practice?${encodeSession(session)}`)}
              >
                <RotateCcw size={16} />
                再来一轮
              </Button>
            )}
            {words.length > 0 && (
              <Button
                size="3"
                variant="soft"
                className="w-full"
                onClick={() => router.push('/practice?review=1')}
              >
                <NotebookText size={16} />
                复习错题（{words.length}）
              </Button>
            )}
            <Button
              size="3"
              variant="surface"
              color="gray"
              className="w-full"
              onClick={() => router.push('/')}
            >
              <Settings2 size={16} />
              返回首页
            </Button>
          </Flex>
        </Flex>
      </Card>
    </Container>
  )
}
