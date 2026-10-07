'use client'

import * as React from 'react'
import { Activity, Check, ChevronRight, CircleCheck, Database, Download, Eye, Headphones, Keyboard, LoaderCircle, Search, SlidersHorizontal, Sparkles, Upload, Volume2, X } from 'lucide-react'
import {
  AlertDialog,
  Badge,
  Box,
  Button,
  Callout,
  Card,
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
import { PrefsError } from '@/components/prefs-error'
import { SectionCard } from '@/components/section-card'
import { downloadBackup, importBackup } from '@/lib/backup'
import { useDayStats, useMasteredBook, usePrefs, useWrongBook } from '@/lib/hooks'
import { speak, stopSpeaking, useSpeechProvider, type SpeechVoice } from '@/lib/speech'
import { EMPTY_DAY, dayKey, summarizeDay } from '@/lib/stats'
import type { EnMode, ExampleMode, SpeechProviderId } from '@/lib/storage'

const PREVIEW_SENTENCE = 'The entrepreneur assembled a brilliant team in Silicon Valley.'

const LOCALE_LABELS: Record<string, string> = {
  'en-GB': '英国英语',
  'en-US': '美国英语',
  'en-AU': '澳大利亚英语',
  'en-CA': '加拿大英语',
  'en-HK': '香港英语',
  'en-IN': '印度英语',
  'en-IE': '爱尔兰英语',
  'en-KE': '肯尼亚英语',
  'en-NZ': '新西兰英语',
  'en-NG': '尼日利亚英语',
  'en-PH': '菲律宾英语',
  'en-SG': '新加坡英语',
  'en-ZA': '南非英语',
  'en-TZ': '坦桑尼亚英语',
}

function voiceDisplayName(voice: SpeechVoice) {
  const name = voice.id.split('-').slice(2).join('-')
    .replace(/MultilingualNeural$/i, '')
    .replace(/Neural$/i, '')
  return name || voice.id
}

/** 标签与控件保持同行，控件区域允许收缩。 */
function FieldRow({
  label,
  control,
  inline = false,
}: {
  label: string
  control: React.ReactNode
  inline?: boolean
}) {
  return (
    <div className={`settings-field${inline ? ' settings-field-inline' : ''}`}>
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

function SpeechPreviewButton({
  canSpeak,
  voiceURI,
  label,
  compact = false,
}: {
  canSpeak: boolean
  voiceURI?: string
  label?: string
  compact?: boolean
}) {
  const [loading, setLoading] = React.useState(false)
  const preview = () => {
    setLoading(true)
    speak(PREVIEW_SENTENCE, {
      voiceURI,
      onStatus: (status) => {
        if (status === 'ready') setLoading(false)
      },
      onError: () => setLoading(false),
    })
  }

  return (
    <Button
      size={compact ? '1' : '2'}
      variant={compact ? 'ghost' : 'soft'}
      color={compact ? 'gray' : undefined}
      className={compact ? 'voice-list-preview' : undefined}
      disabled={!canSpeak || loading}
      aria-label={compact ? `试听${label ? ` ${label}` : '音色'}` : undefined}
      onClick={preview}
    >
      {loading ? <LoaderCircle size={compact ? 13 : 14} className="loading-spinner" /> : <Volume2 size={compact ? 13 : 14} />}
      {!compact && '试听'}
    </Button>
  )
}

/** /settings：朗读 / 练习 / 显示 / 数据 */
export function SettingsView() {
  const [prefs, update, prefsError] = usePrefs()
  const speechProvider = useSpeechProvider()
  const canSpeak = speechProvider.status === 'available'
  const { words: wrongWords } = useWrongBook()
  const { words: masteredWords } = useMasteredBook()
  const days = useDayStats()

  if (!prefs) {
    return (
      <Container size="3" px="4" py="6">
        {prefsError ? <PrefsError error={prefsError} /> : <CardSkeleton />}
      </Container>
    )
  }

  const today = summarizeDay(days[dayKey()] ?? EMPTY_DAY)

  return (
    <Container size="3" px="4" py="6">
      <Flex direction="column" gap="4">
        <Box className="settings-heading">
          <Heading as="h2" size="5">
            设置
          </Heading>
        </Box>

        <SectionCard
          icon={<Volume2 size={16} />}
          title="朗读"
        >
          <FieldRow
            label="后端服务"
            control={
              <SegmentedControl.Root
                aria-label="语音后端服务"
                value={speechProvider.providerId}
                onValueChange={(value) => speechProvider.selectProvider(value as SpeechProviderId)}
              >
                {speechProvider.providers.map((provider) => (
                  <SegmentedControl.Item key={provider.id} value={provider.id}>
                    {provider.name}
                  </SegmentedControl.Item>
                ))}
              </SegmentedControl.Root>
            }
          />
          <Separator size="4" />
          <Flex direction={{ initial: 'column', sm: 'row' }} align={{ initial: 'start', sm: 'center' }} justify="between" gap="3" className="settings-provider-summary">
            <Flex align="center" gap="3" className="min-w-0">
              <Flex align="center" justify="center" className="settings-status-icon" data-status={speechProvider.status}>
                {speechProvider.status === 'checking' ? <LoaderCircle size={18} className="loading-spinner" /> : <Activity size={18} />}
              </Flex>
              <Box className="min-w-0">
                <Text as="div" size="2" weight="medium">
                  {speechProvider.status === 'checking'
                    ? `正在检查${speechProvider.provider.name}语音`
                    : speechProvider.status === 'available'
                      ? `${speechProvider.provider.name}语音已连接`
                      : `${speechProvider.provider.name}语音暂不可用`}
                </Text>
                {speechProvider.status === 'unavailable' && speechProvider.error && (
                  <Text as="div" size="1" color="gray" className="settings-provider-description">
                    {speechProvider.error}
                  </Text>
                )}
              </Box>
            </Flex>
            <Badge size="1" color="gray" variant="soft">
              {speechProvider.provider.name}
            </Badge>
          </Flex>
          <Box className="settings-voice-block">
            <VoicePicker
              voices={speechProvider.voices}
              value={prefs.voiceURI}
              canSpeak={canSpeak}
              loading={speechProvider.status === 'checking'}
              onChange={(voiceURI) => update({ ...prefs, voiceURI })}
            />
          </Box>
          <Box className="settings-rate-block">
            <Flex align="center" justify="between" gap="2" mb="2">
              <Flex align="center" gap="2">
                <SlidersHorizontal size={15} className="text-[var(--gray-10)]" />
                <Text size="2" weight="medium">语速</Text>
              </Flex>
              <Text size="2" weight="medium" color="indigo" className="tabular-nums">{prefs.rate.toFixed(2)}x</Text>
            </Flex>
            <Slider
              value={[prefs.rate]}
              min={0.5}
              max={1.5}
              step={0.05}
              onValueChange={(v) => update({ ...prefs, rate: v[0] ?? prefs.rate })}
              aria-label="语速"
            />
            <Flex align="center" justify="between" gap="3" mt="2">
              <Text size="1" color="gray">慢</Text>
              <Text size="1" color="gray">标准</Text>
              <Text size="1" color="gray">快</Text>
              <SpeechPreviewButton canSpeak={canSpeak} />
            </Flex>
          </Box>
        </SectionCard>

        <SectionCard
          icon={<Keyboard size={16} />}
          title="练习"
        >
          <FieldRow
            label="语音朗读"
            inline
            control={
              <Switch
                checked={prefs.practiceTts}
                onCheckedChange={(practiceTts) => {
                  update({ ...prefs, practiceTts })
                  if (!practiceTts) stopSpeaking()
                }}
                aria-label="练习语音朗读"
              />
            }
          />
          <Separator size="4" />
          <FieldRow
            label="键盘音效"
            inline
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
  loading,
  onChange,
}: {
  voices: SpeechVoice[]
  value: string | null
  canSpeak: boolean
  loading: boolean
  onChange: (voiceURI: string | null) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const selected = voices.find((voice) => voice.id === value)
  const quickVoices = [
    voices.find((voice) => voice.id === 'en-GB-SoniaNeural'),
    voices.find((voice) => voice.id === 'en-GB-LibbyNeural'),
    voices.find((voice) => voice.id === 'en-GB-RyanNeural'),
    voices.find((voice) => voice.id === 'en-US-AvaNeural'),
  ].filter((voice): voice is SpeechVoice => Boolean(voice))
  const filteredVoices = voices.filter((voice) =>
    `${voice.name} ${voice.locale} ${voice.gender ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()),
  )
  const groups = Array.from(
    filteredVoices.reduce((map, voice) => {
      const list = map.get(voice.locale) ?? []
      list.push(voice)
      map.set(voice.locale, list)
      return map
    }, new Map<string, SpeechVoice[]>()).entries(),
  )
  const choose = (id: string | null) => onChange(id)

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) setSearch(''); setOpen(next) }}>
      <Flex direction="column" gap="2">
        <Flex align="center" justify="between" gap="2" className="settings-voice-picker-head">
          <Flex align="center" gap="2">
            <Headphones size={15} className="text-[var(--gray-10)]" />
            <Text size="2" weight="medium">音色</Text>
          </Flex>
          <Dialog.Trigger>
            <Button variant="outline" color="gray" size="1" aria-label="浏览全部音色">
              全部音色
              <ChevronRight size={13} />
            </Button>
          </Dialog.Trigger>
        </Flex>
        <div className="settings-quick-voices">
          <Button
            variant={value === null ? 'soft' : 'outline'}
            color={value === null ? undefined : 'gray'}
            size="2"
            className="settings-quick-voice settings-auto-quick-voice"
            onClick={() => choose(null)}
          >
            <Sparkles size={13} />
            <span className="settings-quick-voice-label">自动</span>
            <span className="settings-quick-voice-check">{value === null && <CircleCheck size={15} />}</span>
          </Button>
          {loading
            ? Array.from({ length: 4 }, (_, index) => <span key={index} className="settings-voice-loading-pill" aria-hidden="true" />)
            : quickVoices.map((voice) => (
              <Button
                key={voice.id}
                variant={value === voice.id ? 'soft' : 'outline'}
                color={value === voice.id ? undefined : 'gray'}
                size="2"
                className="settings-quick-voice"
                onClick={() => choose(voice.id)}
              >
                <span className="settings-quick-voice-label">{voiceDisplayName(voice)}</span>
                <span className="settings-quick-voice-check">{value === voice.id && <CircleCheck size={15} />}</span>
              </Button>
            ))}
        </div>
      </Flex>
      <Dialog.Content maxWidth="520px" style={{ maxHeight: '85dvh' }}>
        <Flex align="center" justify="between" mb="2">
          <Dialog.Title mb="0">选择云端音色</Dialog.Title>
          <Dialog.Close>
            <Button variant="ghost" color="gray" aria-label="关闭音色选择">
              <X size={18} />
            </Button>
          </Dialog.Close>
        </Flex>
        <TextField.Root
          placeholder="搜索音色"
          aria-label="搜索音色"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          mb="3"
        >
          <TextField.Slot><Search size={16} /></TextField.Slot>
        </TextField.Root>
        <ScrollArea type="auto" scrollbars="vertical" style={{ height: 'min(52dvh, 420px)' }}>
          <div className="voice-groups">
            <Button
              variant={value === null ? 'soft' : 'outline'}
              color={value === null ? undefined : 'gray'}
              className="settings-auto-voice"
              aria-pressed={value === null}
              onClick={() => { choose(null); setOpen(false) }}
            >
              <Flex align="center" gap="2" className="min-w-0">
                <Sparkles size={14} />
                <span className="min-w-0 text-left">自动</span>
              </Flex>
              {value === null && <Check size={16} />}
            </Button>
            {loading && (
              <div className="voice-loading-grid" role="status" aria-label="正在加载音色">
                {Array.from({ length: 9 }, (_, index) => <span key={index} className="voice-loading-card" aria-hidden="true" />)}
              </div>
            )}
            {!loading && groups.map(([locale, localeVoices]) => (
              <Box key={locale}>
                <Flex align="center" gap="2" mb="2">
                  <Text size="2" weight="medium" color="gray">{LOCALE_LABELS[locale] ?? locale}</Text>
                  <Separator size="4" />
                </Flex>
                <div className="voice-choice-grid">
                  {localeVoices.map((voice) => (
                    <Card key={voice.id} size="1" className="voice-choice-card">
                      <Button
                        variant={value === voice.id ? 'soft' : 'ghost'}
                        color={value === voice.id ? undefined : 'gray'}
                        aria-pressed={value === voice.id}
                        aria-label={`选择 ${voiceDisplayName(voice)}`}
                        className="settings-voice-choice"
                        onClick={() => { choose(voice.id); setOpen(false) }}
                      >
                        <span className="voice-list-label">{voiceDisplayName(voice)}</span>
                        <span className="voice-list-check">{value === voice.id && <Check size={16} />}</span>
                      </Button>
                      <SpeechPreviewButton canSpeak={canSpeak} voiceURI={voice.id} label={voiceDisplayName(voice)} compact />
                    </Card>
                  ))}
                </div>
              </Box>
            ))}
            {!loading && filteredVoices.length === 0 && <Text as="p" size="2" color="gray">没有匹配的音色。</Text>}
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

  function exportData() {
    setError(null)
    try {
      downloadBackup()
    } catch {
      setError('导出失败：无法读取本地数据，或数据格式无效。')
    }
  }

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
        <Button size="2" onClick={exportData}>
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
