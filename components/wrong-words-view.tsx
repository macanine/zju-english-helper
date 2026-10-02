'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Award, BookX, Check, NotebookText, PartyPopper, Play, Trash2, Undo2 } from 'lucide-react'
import {
  AlertDialog,
  Badge,
  Button,
  Card,
  Container,
  Flex,
  SegmentedControl,
  Text,
} from '@radix-ui/themes'
import { CardSkeleton } from '@/components/card-skeleton'
import { SectionCard } from '@/components/section-card'
import { WordDisplay } from '@/components/word-table'
import { useMasteredBook, useWordStats, useWrongBook } from '@/lib/hooks'

type Tab = 'wrong' | 'mastered'

/**
 * /wrong-words：错题本整页视图。布局只留三个大开关：
 * 页头卡（分组切换 + 全宽开始复习）→ 词条列表（每行带文字的操作按钮）→ 底部清空。
 * 不再用图标小按钮，所有操作都有文字，移动端操作统一收进词卡底部。
 */
export function WrongWordsView() {
  const router = useRouter()
  const { engine, words } = useWrongBook()
  const { words: mastered } = useMasteredBook()
  const stats = useWordStats()
  const [tab, setTab] = React.useState<Tab>('wrong')

  // 错得多的排前面，与复习队列的顺序一致
  const sortedWrong = React.useMemo(
    () =>
      [...words].sort((a, b) => (stats[b.english]?.wrongs ?? 0) - (stats[a.english]?.wrongs ?? 0)),
    [words, stats]
  )

  if (!engine) {
    return (
      <Container size="3" px="4" py="6">
        <CardSkeleton />
      </Container>
    )
  }

  const current = tab === 'wrong' ? sortedWrong : mastered

  return (
    <Container size="3" px="4" py="6">
      <Flex direction="column" gap="4">
        <SectionCard
          icon={<BookX size={16} />}
          title="错题本"
        >
          <SegmentedControl.Root
            aria-label="错题本分组"
            size="3"
            value={tab}
            onValueChange={(v) => setTab(v as Tab)}
            className="w-full"
          >
            <SegmentedControl.Item value="wrong">错题（{words.length}）</SegmentedControl.Item>
            <SegmentedControl.Item value="mastered">
              已掌握（{mastered.length}）
            </SegmentedControl.Item>
          </SegmentedControl.Root>

          <Button
            size="3"
            className="w-full"
            disabled={words.length === 0}
            onClick={() => router.push('/practice?review=1')}
          >
            <NotebookText size={18} />
            开始复习{words.length > 0 ? `（${words.length} 词）` : ''}
          </Button>

        </SectionCard>

        {current.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          <>
            <WordDisplay
              sections={[
                {
                  key: tab,
                  words: current.map((card) => ({ english: card.english, senses: card.senses })),
                },
              ]}
              renderMeta={(entry) => {
                const n = stats[entry.english]?.wrongs ?? 0
                if (tab !== 'wrong' || n === 0) return null
                return (
                  <Badge color="red" variant="soft" size="2">
                    错 {n} 次
                  </Badge>
                )
              }}
              renderActions={(entry) => {
                const card = current.find((c) => c.english === entry.english)
                if (!card) return null
                if (tab === 'wrong') {
                  return (
                    <>
                      <Button
                        size="3"
                        variant="soft"
                        color="green"
                        onClick={() => engine.masterWord(card)}
                      >
                        <Check size={14} />
                        已掌握
                      </Button>
                      <Button
                        size="3"
                        variant="soft"
                        color="gray"
                        onClick={() => engine.removeWrongWord(card)}
                      >
                        移除
                      </Button>
                    </>
                  )
                }
                return (
                  <Button
                    size="3"
                    variant="soft"
                    color="gray"
                    onClick={() => engine.unmasterWord(card)}
                  >
                    <Undo2 size={14} />
                    放回错题
                  </Button>
                )
              }}
            />

            {tab === 'wrong' && (
              <Flex justify="center" pb="2">
                <AlertDialog.Root>
                  <AlertDialog.Trigger>
                    <Button variant="ghost" color="gray" size="3">
                      <Trash2 size={14} />
                      清空错题本
                    </Button>
                  </AlertDialog.Trigger>
                  <AlertDialog.Content maxWidth="360px">
                    <AlertDialog.Title>清空错题本？</AlertDialog.Title>
                    <AlertDialog.Description size="3">
                      将移除全部 {words.length} 个错词，此操作不可撤销。
                    </AlertDialog.Description>
                    <Flex gap="3" mt="4" justify="end">
                      <AlertDialog.Cancel>
                        <Button size="3" variant="soft" color="gray">
                          取消
                        </Button>
                      </AlertDialog.Cancel>
                      <AlertDialog.Action>
                        <Button
                          size="3"
                          variant="solid"
                          color="red"
                          onClick={() => engine.clearWrongWords()}
                        >
                          确认清空
                        </Button>
                      </AlertDialog.Action>
                    </Flex>
                  </AlertDialog.Content>
                </AlertDialog.Root>
              </Flex>
            )}
          </>
        )}
      </Flex>
    </Container>
  )
}

/** 空态：图标圆块 + 一句话 + （错题为空时）去练习的出口 */
function EmptyState({ tab }: { tab: Tab }) {
  return (
    <Card size="4" className="anim-in-up">
      <Flex direction="column" align="center" gap="2" py="7">
        <Flex
          align="center"
          justify="center"
          className="size-12 rounded-full"
          style={{ backgroundColor: 'var(--gray-a3)', color: 'var(--gray-11)' }}
        >
          {tab === 'wrong' ? <PartyPopper size={20} /> : <Award size={20} />}
        </Flex>
        <Text size="3" weight="medium">
          {tab === 'wrong' ? '错题本是空的' : '还没有已掌握的词'}
        </Text>
        {tab === 'wrong' && (
          <Button variant="soft" mt="2" asChild>
            <Link href="/">
              <Play size={14} />
              去做练习
            </Link>
          </Button>
        )}
      </Flex>
    </Card>
  )
}
