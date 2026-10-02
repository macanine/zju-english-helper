'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { CircleAlert, Play } from 'lucide-react'
import {
  Box,
  Button,
  Callout,
  Card,
  Container,
  Flex,
  Grid,
  Heading,
  SegmentedControl,
  Select,
  Text,
} from '@radix-ui/themes'
import { CardSkeleton } from '@/components/card-skeleton'
import { WordDisplay, type WordSection } from '@/components/word-table'
import { unitLabel, loadWords } from '@/lib/data'
import { useBooks, useSettings } from '@/lib/hooks'
import type { WordEntry } from '@/lib/model'
import { encodeSession } from '@/lib/session'
import { DEFAULT_SETTINGS } from '@/lib/storage'

/** 列表首屏只渲染这么多条，其余靠「显示更多」，避免整册 900+ 词一次性铺满 DOM */
const PAGE_SIZE = 50

/** /browse：预习整本词库 —— 词典表格里看释义与例句，点按整行朗读 */
export function BrowseView() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { books, error: booksError } = useBooks()
  const [settings] = useSettings()

  // 选择状态放在 URL 查询串里（units 缺省 = 全部单元），刷新 / 分享不丢
  const bookId = books?.some((b) => b.id === searchParams.get('book')) ? searchParams.get('book')! : (books?.[0]?.id ?? '')
  const bookUnits = books?.find((b) => b.id === bookId)?.units ?? []
  const unitsParam = searchParams.get('units')
  const unitIds = React.useMemo(() => {
    if (!unitsParam) return bookUnits
    const valid = unitsParam.split(',').filter((u) => bookUnits.includes(u))
    return valid.length > 0 ? valid : bookUnits
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, unitsParam])

  const update = (next: { bookId?: string; unitIds?: string[] | 'all' }) => {
    const b = next.bookId ?? bookId
    const allUnits = books?.find((x) => x.id === b)?.units ?? []
    const us = next.unitIds === 'all' ? allUnits : (next.unitIds ?? unitIds)
    const p = new URLSearchParams()
    if (b) p.set('book', b)
    if (us.length > 0 && us.length < allUnits.length) p.set('units', us.join(','))
    router.replace(`/browse?${p.toString()}`, { scroll: false })
  }

  // 按单元逐个加载，保留分组顺序
  const unitKey = `${bookId}\u0000${unitIds.join(',')}`
  const [groups, setGroups] = React.useState<{ unit: string; words: WordEntry[] }[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (!bookId || unitIds.length === 0) return
    let cancelled = false
    setGroups(null)
    setError(null)
    Promise.all(
      unitIds.map(async (unit) => ({ unit, words: await loadWords(bookId, [unit]) }))
    )
      .then((g) => {
        if (!cancelled) setGroups(g)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitKey])

  const [visibleLimit, setVisibleLimit] = React.useState(PAGE_SIZE)
  React.useEffect(() => setVisibleLimit(PAGE_SIZE), [unitKey])

  if (!books) {
    return (
      <Container size="3" px="4" py="6">
        <CardSkeleton />
      </Container>
    )
  }

  const isAllUnits = unitIds.length === bookUnits.length

  const visibleGroups = groups ?? []
  const totalVisible = visibleGroups.reduce((acc, g) => acc + g.words.length, 0)
  const sections: WordSection[] = []
  let shown = 0
  for (const g of visibleGroups) {
    if (shown >= visibleLimit) break
    if (g.words.length === 0) continue
    const take = g.words.slice(0, visibleLimit - shown)
    shown += take.length
    sections.push({
      key: g.unit,
      // 多单元时才显示分组行；数量取该组匹配到的词数
      label: unitIds.length > 1 ? `Unit ${unitLabel(g.unit)} · ${g.words.length} 词` : undefined,
      words: take,
    })
  }

  const practiceHref = () => {
    const base = settings ?? DEFAULT_SETTINGS
    return `/practice?${encodeSession({
      kind: 'practice',
      bookId,
      units: unitIds,
      options: {
        contentFilter: 'all',
        orderMode: base.orderMode,
        questionMode: base.questionMode,
        mergeMode: base.mergeMode,
        showFirstLetter: base.showFirstLetter,
      },
    })}`
  }

  return (
    <Container size="3" px="4" py="6">
      <Flex direction="column" gap="4">
        <Card size="4" className="anim-in-up">
          <Flex direction="column" gap="4">
            <Box>
              <Heading as="h2" size="4">
                预习词库
              </Heading>
            </Box>
            <Grid columns={{ initial: '1', md: '2' }} gap="3">
              <Box>
                <Text as="div" size="2" weight="medium" mb="1">
                  词书
                </Text>
                <SegmentedControl.Root
                  aria-label="选择词书"
                  value={bookId}
                  onValueChange={(v) => update({ bookId: v, unitIds: 'all' })}
                  size="3"
                  className="w-full"
                >
                  {books.map((b) => (
                    <SegmentedControl.Item key={b.id} value={b.id}>
                      {b.name}
                    </SegmentedControl.Item>
                  ))}
                </SegmentedControl.Root>
              </Box>
              <Box>
                <Text as="div" size="2" weight="medium" mb="1">
                  单元
                </Text>
                <Select.Root
                  size="3"
                  value={isAllUnits ? 'all' : (unitIds[0] ?? 'all')}
                  onValueChange={(v) => update({ unitIds: v === 'all' ? 'all' : [v] })}
                >
                  <Select.Trigger
                    aria-label="选择单元"
                    className="browse-unit-trigger"
                  />
                  <Select.Content position="popper">
                    <Select.Item value="all">全部单元（{bookUnits.length}）</Select.Item>
                    {bookUnits.map((u) => (
                      <Select.Item key={u} value={u}>
                        Unit {unitLabel(u)}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </Box>
            </Grid>
            <Button
              size="3"
              variant="soft"
              asChild
              disabled={totalVisible === 0}
              className="w-full"
            >
              <Link href={practiceHref()}>
                <Play size={16} />
                练习当前范围
              </Link>
            </Button>

            {(booksError ?? error) && (
              <Callout.Root color="red" variant="soft" size="2">
                <Callout.Icon>
                  <CircleAlert size={16} />
                </Callout.Icon>
                <Callout.Text>{booksError ?? error}</Callout.Text>
              </Callout.Root>
            )}
          </Flex>
        </Card>

        {!groups ? (
          <div className="h-96 animate-pulse rounded-2xl bg-[var(--gray-a3)]" />
        ) : totalVisible === 0 ? (
          <Flex direction="column" align="center" gap="2" py="8">
            <Text size="5">🔍</Text>
            <Text size="3" weight="medium">
              当前范围没有词条
            </Text>
          </Flex>
        ) : (
          <>
            <WordDisplay sections={sections} />
            {totalVisible > shown && (
              <Flex justify="center" py="2">
                <Button
                  size="3"
                  variant="soft"
                  color="gray"
                  onClick={() => setVisibleLimit((n) => n + PAGE_SIZE)}
                >
                  显示更多（还有 {totalVisible - shown} 条）
                </Button>
              </Flex>
            )}
          </>
        )}
      </Flex>
    </Container>
  )
}
