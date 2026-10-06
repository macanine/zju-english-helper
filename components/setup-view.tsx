'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CircleAlert, NotebookText, Play } from 'lucide-react'
import {
  Box,
  Button,
  Callout,
  Card,
  Container,
  Flex,
  Heading,
  SegmentedControl,
  Switch,
  Text,
} from '@radix-ui/themes'
import { unitLabel } from '@/lib/data'
import type { MergeMode } from '@/lib/model'
import { useBooks, useSettings, useWrongBook } from '@/lib/hooks'
import { encodeSession, sessionFromSettings } from '@/lib/session'
import type { Settings } from '@/lib/storage'
import { TodayCard } from '@/components/today-stats'
import { CardSkeleton } from '@/components/card-skeleton'

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text as="div" size="2" weight="medium">{children}</Text>
}

export function SetupView() {
  const router = useRouter()
  const { books, error } = useBooks()
  const [settings, update] = useSettings()
  const { words } = useWrongBook()

  if (error) {
    return (
      <Container size="3" px="4" py="6">
        <Callout.Root color="red" role="alert">
          <Callout.Icon><CircleAlert size={16} /></Callout.Icon>
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      </Container>
    )
  }

  if (!books || !settings) {
    return (
      <Container size="3" px="4" py="6">
        <CardSkeleton label="正在加载词库与设置…" />
      </Container>
    )
  }

  const units = books.find((b) => b.id === settings.bookId)?.units ?? []
  const noUnits = settings.units.length === 0 || settings.units.some((unit) => !units.includes(unit))

  const start = () => {
    if (noUnits) return
    router.push(`/practice?${encodeSession(sessionFromSettings(settings))}`)
  }

  const switchBook = (bookId: string) => {
    update({ ...settings, bookId, units: [] })
  }

  const toggleUnit = (unit: string) => {
    update({
      ...settings,
      units: settings.units.includes(unit)
        ? settings.units.filter((u) => u !== unit)
        : [...settings.units, unit],
    })
  }

  return (
    <Container size="3" px="4" py="6">
      <Flex direction="column" gap="4">
        <TodayCard />

        <Card size={{ initial: '2', sm: '3' }} className="anim-in-up">
        <Flex direction="column" gap="4">
          <Box>
            <Heading as="h2" size="4">
              开始练习
            </Heading>
          </Box>

          {/* 词书 */}
          <Flex direction="column" gap="2">
            <FieldLabel>词书</FieldLabel>
            <SegmentedControl.Root
              size="3"
              aria-label="选择词书"
              value={settings.bookId}
              onValueChange={switchBook}
              className="w-full"
            >
              {books.map((b) => (
                <SegmentedControl.Item key={b.id} value={b.id}>
                  {b.name}
                </SegmentedControl.Item>
              ))}
            </SegmentedControl.Root>
          </Flex>

          {/* 单元 */}
          <Flex direction="column" gap="2">
            <Flex align="center" justify="between" gap="2" wrap="wrap">
              <FieldLabel>单元（已选 {settings.units.length} 个）</FieldLabel>
              <Flex gap="2" className="shrink-0">
                <Button
                  variant="ghost"
                  color="gray"
                  size="2"
                  onClick={() => update({ ...settings, units: [...units] })}
                >
                  全选
                </Button>
                <Button
                  variant="ghost"
                  color="gray"
                  size="2"
                  disabled={noUnits}
                  onClick={() => update({ ...settings, units: [] })}
                >
                  清空
                </Button>
              </Flex>
            </Flex>
            {/* 列数随实际可用宽度变化，避免小屏或系统放大字体时把单元编号挤断行。 */}
            <div className="unit-grid">
              {units.map((u) => {
                const selected = settings.units.includes(u)
                return (
                  <Button
                    key={u}
                    size="3"
                    variant={selected ? 'solid' : 'surface'}
                    color={selected ? undefined : 'gray'}
                    aria-pressed={selected}
                    onClick={() => toggleUnit(u)}
                    className="unit-button w-full min-w-0 whitespace-nowrap px-1"
                  >
                    <span className="unit-label">{unitLabel(u)}</span>
                  </Button>
                )
              })}
            </div>
          </Flex>

          {/* 内容 */}
          <Flex direction="column" gap="2">
            <FieldLabel>内容</FieldLabel>
            <SegmentedControl.Root
              size="3"
              aria-label="选择内容"
              value={settings.contentFilter}
              onValueChange={(v) =>
                update({ ...settings, contentFilter: v as Settings['contentFilter'] })
              }
              className="w-full"
            >
              <SegmentedControl.Item value="all">全部</SegmentedControl.Item>
              <SegmentedControl.Item value="words_only">仅单词</SegmentedControl.Item>
              <SegmentedControl.Item value="phrases_only">仅短语</SegmentedControl.Item>
            </SegmentedControl.Root>
          </Flex>

          {/* 顺序 / 模式 */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Flex direction="column" gap="2">
              <FieldLabel>顺序</FieldLabel>
              <SegmentedControl.Root
                size="3"
                aria-label="选择顺序"
                value={settings.orderMode}
                onValueChange={(v) =>
                  update({ ...settings, orderMode: v as Settings['orderMode'] })
                }
                className="w-full"
              >
                <SegmentedControl.Item value="sequential">顺序</SegmentedControl.Item>
                <SegmentedControl.Item value="random">随机</SegmentedControl.Item>
              </SegmentedControl.Root>
            </Flex>
            <Flex direction="column" gap="2">
              <FieldLabel>模式</FieldLabel>
              <SegmentedControl.Root
                size="3"
                aria-label="选择模式"
                value={settings.questionMode}
                onValueChange={(v) =>
                  update({ ...settings, questionMode: v as Settings['questionMode'] })
                }
                className="w-full"
              >
              <SegmentedControl.Item value="word">单词</SegmentedControl.Item>
              <SegmentedControl.Item value="listen">听写</SegmentedControl.Item>
              <SegmentedControl.Item value="example">例句填空</SegmentedControl.Item>
              </SegmentedControl.Root>
            </Flex>
          </div>

          {/* 偏好 */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Flex
              justify="between"
              align="center"
              gap="4"
              px="4"
              py="3"
              className="rounded-xl border border-[var(--gray-a4)]"
            >
              <Box className="min-w-0">
                <Text as="label" size="2">
                  显示首字母提示
                </Text>
              </Box>
              <Switch
                checked={settings.showFirstLetter}
                onCheckedChange={(v) => update({ ...settings, showFirstLetter: v })}
                aria-label="显示首字母提示"
              />
            </Flex>

            <Flex
              justify="between"
              align="center"
              gap="4"
              px="4"
              py="3"
              className="rounded-xl border border-[var(--gray-a4)]"
            >
              <Box className="min-w-0">
                <Text as="label" size="2">
                  多义词只考一次
                </Text>
              </Box>
              <Switch
                checked={settings.mergeMode !== 'sense'}
                onCheckedChange={(on) =>
                  update({ ...settings, mergeMode: on ? 'all' : 'sense' })
                }
                aria-label="多义词只考一次"
              />
            </Flex>

            {settings.mergeMode !== 'sense' && (
              <Flex direction="column" gap="2" className="sm:col-span-2">
                <FieldLabel>题面提示</FieldLabel>
                <SegmentedControl.Root
                  size="3"
                  aria-label="多义词题面提示"
                  value={settings.mergeMode}
                  onValueChange={(v) => update({ ...settings, mergeMode: v as MergeMode })}
                  className="w-full"
                >
                  <SegmentedControl.Item value="all">全部释义</SegmentedControl.Item>
                  <SegmentedControl.Item value="first">首条释义</SegmentedControl.Item>
                </SegmentedControl.Root>
              </Flex>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button size="3" disabled={noUnits} onClick={start} className="w-full">
              <Play size={16} />
              开始练习
            </Button>
            <Button
              size="3"
              variant="soft"
              disabled={words.length === 0}
              onClick={() => router.push('/practice?review=1')}
              className="w-full"
            >
              <NotebookText size={16} />
              复习错题{words.length > 0 ? `（${words.length}）` : ''}
            </Button>
          </div>
        </Flex>
        </Card>
      </Flex>
    </Container>
  )
}
