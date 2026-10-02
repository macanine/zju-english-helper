'use client'

import * as React from 'react'
import { Database, Download, Eye, Keyboard, Upload, Volume2 } from 'lucide-react'
import {
  AlertDialog,
  Box,
  Button,
  Callout,
  Card,
  Container,
  Flex,
  Heading,
  SegmentedControl,
  Select,
  Separator,
  Slider,
  Switch,
  Text,
} from '@radix-ui/themes'
import { CardSkeleton } from '@/components/card-skeleton'
import { SectionCard } from '@/components/section-card'
import { downloadBackup, importBackup } from '@/lib/backup'
import { useDayStats, useMasteredBook, usePrefs, useWrongBook } from '@/lib/hooks'
import { useCanSpeak, useVoices, speak } from '@/lib/speech'
import { EMPTY_DAY, dayKey, summarizeDay } from '@/lib/stats'
import type { EnMode, ExampleMode } from '@/lib/storage'

const PREVIEW_SENTENCE = 'The entrepreneur assembled a brilliant team in Silicon Valley.'

/** 设置项：小屏标签在上、控件铺满；宽屏标签左、控件右 */
function FieldRow({
  label,
  control,
}: {
  label: string
  control: React.ReactNode
}) {
  return (
    <Flex
      direction={{ initial: 'column', md: 'row' }}
      justify={{ initial: 'start', md: 'between' }}
      align={{ initial: 'stretch', md: 'center' }}
      gap={{ initial: '2', md: '4' }}
    >
      <Box className="min-w-0 flex-1">
        <Text as="div" size="2" weight="medium">
          {label}
        </Text>
      </Box>
      <Flex align="center" justify="end" gap="2" className="w-full shrink-0 md:w-auto">
        {control}
      </Flex>
    </Flex>
  )
}

/** 数据概览里的一个小统计 */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <Flex direction="column" gap="1">
      <Text size="4" weight="medium" className="tabular-nums leading-none">
        {value}
      </Text>
      <Text size="2" color="gray">
        {label}
      </Text>
    </Flex>
  )
}

/** /settings：朗读 / 练习 / 显示 / 数据 */
export function SettingsView() {
  const [prefs, update] = usePrefs()
  const voices = useVoices()
  const canSpeak = useCanSpeak()
  const { words: wrongWords } = useWrongBook()
  const { words: masteredWords } = useMasteredBook()
  const days = useDayStats()

  if (!prefs) {
    return (
      <Container size="2" px="4" py="6">
        <CardSkeleton />
      </Container>
    )
  }

  const today = summarizeDay(days[dayKey()] ?? EMPTY_DAY)

  return (
    <Container size="2" px="4" py="6">
      <Flex direction="column" gap="4">
        <Box>
          <Heading as="h2" size="5">
            设置
          </Heading>
        </Box>

        <SectionCard
          icon={<Volume2 size={16} />}
          title="朗读"
        >
          <FieldRow
            label="语音"
            control={
              <Select.Root
                value={prefs.voiceURI ?? 'auto'}
                onValueChange={(v) => update({ ...prefs, voiceURI: v === 'auto' ? null : v })}
              >
                <Select.Trigger aria-label="选择语音" className="w-full md:w-52" />
                <Select.Content position="popper">
                  <Select.Item value="auto">自动</Select.Item>
                  {voices.map((v) => (
                    <Select.Item key={v.voiceURI} value={v.voiceURI}>
                      {v.name}（{v.lang}）
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            }
          />
          <Separator size="4" />
          <FieldRow
            label="语速"
            control={
              <Flex align="center" gap="3" className="w-full md:w-80">
                {/* Slider 需要在定宽容器里 flex-1：Themes 给它设了 width:fit-content，
                    直接写 w-28 会被盖掉 */}
                <Slider
                  value={[prefs.rate]}
                  min={0.5}
                  max={1.5}
                  step={0.05}
                  onValueChange={(v) => update({ ...prefs, rate: v[0] ?? prefs.rate })}
                  aria-label="语速"
                  className="min-w-0 flex-1"
                />
                <Text size="2" color="gray" className="tabular-nums w-10 text-right">
                  {prefs.rate.toFixed(2)}x
                </Text>
                <Button
                  variant="soft"
                  size="2"
                  disabled={!canSpeak}
                  onClick={() => speak(PREVIEW_SENTENCE)}
                >
                  <Volume2 size={14} />
                  试听
                </Button>
              </Flex>
            }
          />
        </SectionCard>

        <SectionCard
          icon={<Keyboard size={16} />}
          title="练习"
        >
          <FieldRow
            label="键盘音效"
            control={
              <Switch
                checked={prefs.keySound}
                onCheckedChange={(keySound) => update({ ...prefs, keySound })}
                aria-label="键盘音效"
              />
            }
          />
        </SectionCard>

        <SectionCard
          icon={<Eye size={16} />}
          title="显示"
        >
          <FieldRow
            label="英文解释"
            control={
              <SegmentedControl.Root
                aria-label="英文解释显示方式"
                value={prefs.enMode}
                onValueChange={(v) => update({ ...prefs, enMode: v as EnMode })}
                className="w-full md:w-auto"
              >
                <SegmentedControl.Item value="always">常显</SegmentedControl.Item>
                <SegmentedControl.Item value="collapsible">收起</SegmentedControl.Item>
                <SegmentedControl.Item value="hidden">隐藏</SegmentedControl.Item>
              </SegmentedControl.Root>
            }
          />
          <Separator size="4" />
          <FieldRow
            label="例句"
            control={
              <SegmentedControl.Root
                aria-label="例句显示方式"
                value={prefs.exampleMode}
                onValueChange={(v) => update({ ...prefs, exampleMode: v as ExampleMode })}
                className="w-full md:w-auto"
              >
                <SegmentedControl.Item value="always">常显</SegmentedControl.Item>
                <SegmentedControl.Item value="collapsible">收起</SegmentedControl.Item>
                <SegmentedControl.Item value="hidden">隐藏</SegmentedControl.Item>
              </SegmentedControl.Root>
            }
          />
        </SectionCard>

        <SectionCard
          icon={<Database size={16} />}
          title="数据"
        >
          <Flex
            gap={{ initial: '4', md: '6' }}
            wrap="wrap"
            px="4"
            py="3"
            className="rounded-xl bg-[var(--gray-a2)]"
          >
            <Stat value={String(wrongWords.length)} label="错题" />
            <Stat value={String(masteredWords.length)} label="已掌握" />
            <Stat value={`${today.words}`} label="今日练习（词）" />
          </Flex>
          <DataSection />
        </SectionCard>
      </Flex>
    </Container>
  )
}

/** 导出 / 导入本地数据（纯前端，文件不经过服务器） */
function DataSection() {
  const fileRef = React.useRef<HTMLInputElement>(null)
  const [pending, setPending] = React.useState<{ name: string; text: string } | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // 允许再次选择同一个文件
    if (!file) return
    setError(null)
    file
      .text()
      .then((text) => setPending({ name: file.name, text }))
      .catch(() => setError('读取文件失败，请重试。'))
  }

  function confirmImport() {
    if (!pending) return
    const result = importBackup(pending.text)
    setPending(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    location.reload() // 让引擎与设置重新从 localStorage 读取
  }

  return (
    <Flex direction="column" gap="3">
      <Flex
        direction={{ initial: 'column', md: 'row' }}
        gap="3"
        className="w-full md:w-auto"
      >
        <Button size="3" className="w-full md:w-auto" onClick={() => downloadBackup()}>
          <Download size={16} />
          导出备份
        </Button>
        <Button
          size="3"
          variant="soft"
          color="gray"
          className="w-full md:w-auto"
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={16} />
          导入备份
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={onFileChange}
          aria-hidden
          tabIndex={-1}
        />
      </Flex>

      {error && (
        <Callout.Root color="red" variant="soft" size="2">
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}

      <AlertDialog.Root open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialog.Content maxWidth="400px">
          <AlertDialog.Title>导入备份？</AlertDialog.Title>
          <AlertDialog.Description size="3">
            将用「{pending?.name}」覆盖当前的错题本、学习记录与设置，此操作不可撤销。
          </AlertDialog.Description>
          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button size="3" variant="soft" color="gray">
                取消
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button size="3" color="red" onClick={confirmImport}>
                覆盖导入
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </Flex>
  )
}
