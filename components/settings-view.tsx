'use client'

import * as React from 'react'
import { Check, ChevronRight, Database, Download, Eye, Keyboard, Search, Upload, Volume2, X } from 'lucide-react'
import {
  AlertDialog,
  Box,
  Button,
  Callout,
  Container,
  Dialog,
  Flex,
  Heading,
  SegmentedControl,
  ScrollArea,
  Separator,
  Slider,
  Switch,
  Text,
  TextField,
} from '@radix-ui/themes'
import { CardSkeleton } from '@/components/card-skeleton'
import { SectionCard } from '@/components/section-card'
import { downloadBackup, importBackup } from '@/lib/backup'
import { useDayStats, useMasteredBook, usePrefs, useWrongBook } from '@/lib/hooks'
import { useCanSpeak, useVoices, speak } from '@/lib/speech'
import { EMPTY_DAY, dayKey, summarizeDay } from '@/lib/stats'
import type { EnMode, ExampleMode } from '@/lib/storage'

const PREVIEW_SENTENCE = 'The entrepreneur assembled a brilliant team in Silicon Valley.'

/** 标签与控件保持同行，控件区域允许收缩。 */
function FieldRow({
  label,
  control,
}: {
  label: string
  control: React.ReactNode
}) {
  return (
    <div className="settings-field">
      <Box>
        <Text as="div" size="2" weight="medium">
          {label}
        </Text>
      </Box>
      <Flex align="center" justify="end" gap="2" className="min-w-0">
        {control}
      </Flex>
    </div>
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
      <Container size="3" px="4" py="6">
        <CardSkeleton />
      </Container>
    )
  }

  const today = summarizeDay(days[dayKey()] ?? EMPTY_DAY)

  return (
    <Container size="3" px="4" py="6">
      <Flex direction="column" gap="4">
        <Box>
          <Heading as="h2" size="5">
            设置
          </Heading>
        </Box>

        <SectionCard
          compact
          icon={<Volume2 size={16} />}
          title="朗读"
        >
          <FieldRow
            label="语音"
            control={
              <VoicePicker
                voices={voices}
                value={prefs.voiceURI}
                canSpeak={canSpeak}
                onChange={(voiceURI) => update({ ...prefs, voiceURI })}
              />
            }
          />
          <Separator size="4" />
          <FieldRow
            label="语速"
            control={
              <Flex align="center" gap="2" className="settings-rate">
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
                  试听
                </Button>
              </Flex>
            }
          />
        </SectionCard>

        <SectionCard
          compact
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
          compact
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
              >
                <SegmentedControl.Item value="always">常显</SegmentedControl.Item>
                <SegmentedControl.Item value="collapsible">收起</SegmentedControl.Item>
                <SegmentedControl.Item value="hidden">隐藏</SegmentedControl.Item>
              </SegmentedControl.Root>
            }
          />
        </SectionCard>

        <SectionCard
          compact
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

function VoicePicker({
  voices,
  value,
  canSpeak,
  onChange,
}: {
  voices: SpeechSynthesisVoice[]
  value: string | null
  canSpeak: boolean
  onChange: (voiceURI: string | null) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const selected = voices.find((voice) => voice.voiceURI === value)
  const choices = [
    { id: null, name: '自动', lang: '默认英文音色' },
    ...voices.map((voice) => ({ id: voice.voiceURI, name: voice.name, lang: voice.lang })),
  ]
  const visibleChoices = choices.filter((choice) =>
    `${choice.name} ${choice.lang}`.toLowerCase().includes(search.trim().toLowerCase()),
  )

  return (
    <Dialog.Root open={open} onOpenChange={(next) => {
      if (!next && canSpeak) window.speechSynthesis.cancel()
      if (!next) setSearch('')
      setOpen(next)
    }}>
      <Dialog.Trigger>
        <Button variant="soft" color="gray" aria-label="选择音色" className="settings-voice-trigger">
          <span className="truncate">{selected?.name ?? (value ? '已选音色' : '自动')}</span>
          <ChevronRight size={14} className="shrink-0" />
        </Button>
      </Dialog.Trigger>
      <Dialog.Content maxWidth="520px" style={{ maxHeight: '85dvh' }}>
        <Flex align="center" justify="between" mb="2">
          <Dialog.Title mb="0">选择音色</Dialog.Title>
          <Dialog.Close>
            <Button variant="ghost" color="gray" aria-label="关闭音色选择">
              <X size={18} />
            </Button>
          </Dialog.Close>
        </Flex>
        <Dialog.Description size="2" color="gray" mb="3">
          试听后选择，使用当前语速。
        </Dialog.Description>
        <TextField.Root
          placeholder="搜索音色或语言"
          aria-label="搜索音色或语言"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          mb="3"
        >
          <TextField.Slot><Search size={16} /></TextField.Slot>
        </TextField.Root>
        <ScrollArea type="auto" style={{ height: 'min(52dvh, 420px)' }}>
          <div className="voice-list">
            {visibleChoices.map((choice) => (
              <div
                key={choice.id ?? 'auto'}
                className="voice-list-row"
                data-selected={value === choice.id}
              >
                <Button
                  variant="ghost"
                  color={value === choice.id ? undefined : 'gray'}
                  aria-pressed={value === choice.id}
                  aria-label={`选择 ${choice.name}`}
                  className="settings-voice-choice"
                  onClick={() => {
                    onChange(choice.id)
                    if (canSpeak) window.speechSynthesis.cancel()
                    setOpen(false)
                  }}
                >
                  <span className="voice-list-label">
                    <span className="voice-list-name">{choice.name}</span>
                    <span className="voice-list-language">{choice.lang}</span>
                  </span>
                  <span className="voice-list-check">
                    {value === choice.id && <Check size={16} />}
                  </span>
                </Button>
                <Button
                  size="2"
                  variant="ghost"
                  color="gray"
                  className="voice-list-preview"
                  disabled={!canSpeak}
                  aria-label={`试听 ${choice.name}`}
                  onClick={() => speak(PREVIEW_SENTENCE, { voiceURI: choice.id })}
                >
                  <Volume2 size={14} />
                  试听
                </Button>
              </div>
            ))}
            {visibleChoices.length === 0 && <Text as="p" size="2" color="gray">没有匹配的音色。</Text>}
            {!canSpeak && <Text size="2" color="gray">当前浏览器不支持朗读。</Text>}
            {canSpeak && voices.length === 0 && (
              <Text size="2" color="gray">浏览器暂未提供英文音色，可使用自动朗读。</Text>
            )}
          </div>
        </ScrollArea>
      </Dialog.Content>
    </Dialog.Root>
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
        gap="2"
        wrap="wrap"
      >
        <Button size="2" onClick={() => downloadBackup()}>
          <Download size={16} />
          导出备份
        </Button>
        <Button
          size="2"
          variant="soft"
          color="gray"
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
