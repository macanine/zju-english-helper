'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, CircleAlert, Play } from 'lucide-react'
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
import { preloadWords, unitLabel } from '@/lib/data'
import type { MergeMode } from '@/lib/model'
import { useBooks, useSettings, useWrongCount } from '@/lib/hooks'
import { encodeSession, sessionFromSettings } from '@/lib/session'
import type { Settings } from '@/lib/storage'
import { TodayCard } from '@/components/today-stats'
import { CardSkeleton } from '@/components/card-skeleton'

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text as="div" size="2" weight="medium">{children}</Text>
}

function SetupToggle({
  id,
  label,
  checked,
  onCheckedChange,
  disabled = false,
}: {
  id: string
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className="setup-toggle-row" htmlFor={id} data-disabled={disabled}>
      <Text as="span" size="2">{label}</Text>
      <Switch id={id} size="3" checked={checked} onCheckedChange={onCheckedChange} aria-label={label} disabled={disabled} />
    </label>
  )
}

function SetupSection({
  step,
  title,
  children,
}: {
  step: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="setup-section">
      <Flex align="center" gap="2" mb="3">
        <Text as="span" size="1" weight="bold" className="setup-step">
          {step}
        </Text>
        <Heading as="h3" size="2">
          {title}
        </Heading>
      </Flex>
      <Flex direction="column" gap="3">
        {children}
      </Flex>
    </section>
  )
}

const QUESTION_MODE_LABELS: Record<Settings['questionMode'], string> = {
  word: '单词默写',
  listen: '听写',
  example: '例句填空',
}

const CONTENT_FILTER_LABELS: Record<Settings['contentFilter'], string> = {
  all: '全部内容',
  words_only: '仅单词',
  phrases_only: '仅短语',
}

export function SetupView() {
  const router = useRouter()
  const { books, error } = useBooks()
  const [settings, update] = useSettings()
  const dueCount = useWrongCount()

  React.useEffect(() => {
    if (!books || !settings || settings.units.length === 0) return
    const book = books.find((item) => item.id === settings.bookId)
    if (!book || settings.units.some((unit) => !book.units.includes(unit))) return

    let idle: number | null = null
    const timer = window.setTimeout(() => {
      const warmUp = () => {
        const connection = (navigator as Navigator & {
          connection?: { saveData?: boolean; effectiveType?: string }
        }).connection
        if (document.visibilityState !== 'visible' || connection?.saveData ||
            connection?.effectiveType === '2g' || connection?.effectiveType === 'slow-2g') return
        router.prefetch(`/practice?${encodeSession(sessionFromSettings(settings))}`)
        // 预加载失败不缓存；真正开始时重新请求并正常显示错误。
        void preloadWords(settings.bookId, settings.units).catch(() => {})
      }
      if (typeof window.requestIdleCallback === 'function') {
        idle = window.requestIdleCallback(warmUp, { timeout: 2000 })
      } else {
        warmUp()
      }
    }, 800)

    return () => {
      window.clearTimeout(timer)
      if (idle !== null) window.cancelIdleCallback?.(idle)
    }
  }, [books, router, settings])

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
  const selectedBook = books.find((book) => book.id === settings.bookId)
  const optionSummary = [
    CONTENT_FILTER_LABELS[settings.contentFilter],
    settings.orderMode === 'random' ? '随机' : '顺序',
    settings.includeConsolidated && '含已稳固词',
    settings.showFirstLetter && '首字母提示',
    settings.questionMode !== 'example' && settings.mergeMode !== 'sense' &&
      (settings.mergeMode === 'all' ? '合并多义词（全部释义）' : '合并多义词（首条释义）'),
  ].filter(Boolean).join(' · ')

  const start = () => {
    if (noUnits) return
    // 点击后立即开始取词，与练习页代码加载并行；失败由练习页统一处理。
    void preloadWords(settings.bookId, settings.units).catch(() => {})
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
        <TodayCard dueCount={dueCount} />

        <Card size={{ initial: '2', sm: '3' }} className="setup-card anim-in-up">
          <Flex direction="column" gap="4">
            <Heading as="h2" size="4">
              开始练习
            </Heading>

            <SetupSection step="01" title="练习范围">
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

              <Flex direction="column" gap="2">
                <Flex align="center" justify="between" gap="2" wrap="wrap">
                  <FieldLabel>单元（已选 {settings.units.length} 个）</FieldLabel>
                  <Flex gap="2" className="setup-unit-actions shrink-0">
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
                <div className="unit-grid" role="group" aria-label="选择单元">
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
                        className="unit-button w-full min-w-0 whitespace-nowrap px-1 active:scale-[0.97]"
                      >
                        <span className="unit-label">{unitLabel(u)}</span>
                      </Button>
                    )
                  })}
                </div>
              </Flex>
            </SetupSection>

            <SetupSection step="02" title="练习方式">
              <SegmentedControl.Root
                size="3"
                aria-label="选择模式"
                value={settings.questionMode}
                onValueChange={(v) => update({ ...settings, questionMode: v as Settings['questionMode'] })}
                className="w-full"
              >
                <SegmentedControl.Item value="word">单词</SegmentedControl.Item>
                <SegmentedControl.Item value="listen">听写</SegmentedControl.Item>
                <SegmentedControl.Item value="example">例句填空</SegmentedControl.Item>
              </SegmentedControl.Root>

              <details className="disclosure-panel">
                <summary className="disclosure-trigger">
                  <span className="disclosure-copy">
                    <Text as="span" size="2" weight="medium">更多选项</Text>
                    <Text as="span" size="1" color="gray">{optionSummary}</Text>
                  </span>
                  <ChevronDown size={18} className="disclosure-chevron" aria-hidden="true" />
                </summary>
                <Flex direction="column" gap="3" className="disclosure-content">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Flex direction="column" gap="2">
                      <FieldLabel>内容</FieldLabel>
                      <SegmentedControl.Root
                        size="3"
                        aria-label="选择内容"
                        value={settings.contentFilter}
                        onValueChange={(v) => update({ ...settings, contentFilter: v as Settings['contentFilter'] })}
                        className="w-full"
                      >
                        <SegmentedControl.Item value="all">全部</SegmentedControl.Item>
                        <SegmentedControl.Item value="words_only">仅单词</SegmentedControl.Item>
                        <SegmentedControl.Item value="phrases_only">仅短语</SegmentedControl.Item>
                      </SegmentedControl.Root>
                    </Flex>
                    <Flex direction="column" gap="2">
                      <FieldLabel>顺序</FieldLabel>
                      <SegmentedControl.Root
                        size="3"
                        aria-label="选择顺序"
                        value={settings.orderMode}
                        onValueChange={(v) => update({ ...settings, orderMode: v as Settings['orderMode'] })}
                        className="w-full"
                      >
                        <SegmentedControl.Item value="sequential">顺序</SegmentedControl.Item>
                        <SegmentedControl.Item value="random">随机</SegmentedControl.Item>
                      </SegmentedControl.Root>
                    </Flex>
                  </div>

                  <div className="setup-toggle-grid">
                    <SetupToggle id="practice-include-consolidated" label="包含已稳固词"
                      checked={settings.includeConsolidated === true}
                      onCheckedChange={(includeConsolidated) => update({ ...settings, includeConsolidated })} />
                    <SetupToggle id="practice-show-first-letter" label="显示首字母提示"
                      checked={settings.showFirstLetter}
                      onCheckedChange={(showFirstLetter) => update({ ...settings, showFirstLetter })} />
                    <SetupToggle id="practice-merge-senses" label="多义词只考一次"
                      checked={settings.mergeMode !== 'sense'}
                      disabled={settings.questionMode === 'example'}
                      onCheckedChange={(on) => update({ ...settings, mergeMode: on ? 'all' : 'sense' })} />
                  </div>

                  {settings.questionMode === 'example' && <Text size="1" color="gray">例句填空按释义出题</Text>}
                  {settings.questionMode !== 'example' && settings.mergeMode !== 'sense' && (
                    <Flex direction="column" gap="2" className="setup-merge-prompt">
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
                </Flex>
              </details>
            </SetupSection>

            <div className="setup-action-bar">
              <Box className="setup-action-copy">
                <Text as="div" size="2" weight="medium">
                  {selectedBook?.name ?? '未选择词书'}
                </Text>
                <Text as="div" size="1" color="gray">
                  {noUnits ? '请选择至少一个单元' : `${settings.units.length} 个单元 · ${QUESTION_MODE_LABELS[settings.questionMode]}`}
                </Text>
              </Box>
              <Button
                size="3"
                disabled={noUnits}
                onClick={start}
                className="setup-primary-action w-full active:scale-[0.97]"
              >
                <Play size={16} aria-hidden="true" />
                开始练习
              </Button>
            </div>
          </Flex>
        </Card>
      </Flex>
    </Container>
  )
}
