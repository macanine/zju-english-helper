import { MERGE_MODES, isSense, type MergeMode, type SenseCard } from './model'
import { hasFields, isCount, isId, isOneOf, isRecord, isText } from './validation'

export const CONTENT_FILTERS = ['all', 'words_only', 'phrases_only'] as const
export const ORDER_MODES = ['sequential', 'random'] as const
/** word = 看中文写英文；listen = 听发音写英文；example = 例句填空 */
export const QUESTION_MODES = ['word', 'listen', 'example'] as const

export type ContentFilter = (typeof CONTENT_FILTERS)[number]
export type OrderMode = (typeof ORDER_MODES)[number]
export type QuestionMode = (typeof QUESTION_MODES)[number]

/** 与词书无关的练习选项，同时也是练习会话 URL 里承载的部分 */
export interface SessionOptions {
  contentFilter: ContentFilter
  orderMode: OrderMode
  questionMode: QuestionMode
  /** 多义词出题：sense = 每个释义各考一遍；first = 同词只考一次给首条释义；all = 同词只考一次列出全部释义 */
  mergeMode: MergeMode
  showFirstLetter: boolean
}

export interface Settings extends SessionOptions {
  bookId: string
  units: string[]
}

export const DEFAULT_SETTINGS: Settings = {
  bookId: 'book2',
  units: [],
  contentFilter: 'all',
  orderMode: 'sequential',
  questionMode: 'word',
  mergeMode: 'sense',
  showFirstLetter: false,
}

/** 英文解释（含英文释义）在预习 / 错题本里的显示方式 */
export const EN_MODES = ['always', 'collapsible', 'hidden'] as const
export type EnMode = (typeof EN_MODES)[number]

/** 例句在预习 / 错题本里的显示方式 */
export const EXAMPLE_MODES = ['always', 'collapsible', 'hidden'] as const
export type ExampleMode = (typeof EXAMPLE_MODES)[number]

/** 语音服务节点；国内节点默认优先，海外节点作为备用。 */
export const SPEECH_PROVIDER_IDS = ['domestic', 'international'] as const
export type SpeechProviderId = (typeof SPEECH_PROVIDER_IDS)[number]

export interface SpeechSettings {
  provider: SpeechProviderId
}

export const DEFAULT_SPEECH_SETTINGS: SpeechSettings = {
  provider: 'domestic',
}

/** 个性化偏好（设置页） */
export interface Prefs {
  /** TTS provider 音色 ShortName；null = 自动（英音女声优先） */
  voiceURI: string | null
  /** TTS 语速 */
  rate: number
  /** 英文解释：常显 / 默认收起（可展开）/ 隐藏 */
  enMode: EnMode
  /** 例句：常显 / 默认收起（点词块展开）/ 隐藏 */
  exampleMode: ExampleMode
  /** 打字音效（按键 / 错误 / 完成） */
  keySound: boolean
  /** 练习与复习中的语音朗读；不影响词库朗读和设置页试听 */
  practiceTts: boolean
}

export const DEFAULT_PREFS: Prefs = {
  voiceURI: null,
  rate: 0.9,
  enMode: 'collapsible',
  exampleMode: 'always',
  keySound: true,
  practiceTts: true,
}

/** 单词级学习记录：用于错题本排序、错误次数展示与「已掌握」判断 */
export interface WordStat {
  /** 作答次数（跳过不计） */
  attempts: number
  /** 答错次数（含打字过程中出错、看答案） */
  wrongs: number
  /** 最近一次作答时间戳（毫秒）；0 = 从未作答 */
  lastSeen: number
  /** 最近一次答错时间戳（毫秒）；0 = 没错过 */
  lastWrong: number
}

/** 每日练习记录：首页今日概览与连续天数 */
export interface DayStat {
  /** 练习词数 */
  words: number
  /** 首次作答即正确的词数 */
  correct: number
  /** 累计用时（毫秒，按两次作答的间隔累计） */
  ms: number
}

/** 每个存储键的当前数据结构，也是备份导入的校验契约。 */
interface StoredData {
  'zjueh.wrong-words': SenseCard[]
  'zjueh.mastered': SenseCard[]
  'zjueh.settings': Settings
  'zjueh.prefs': Prefs
  'zjueh.speech': SpeechSettings
  'zjueh.word-stats': Record<string, WordStat>
  'zjueh.day-stats': Record<string, DayStat>
}

export const USER_DATA_KEYS = [
  'zjueh.wrong-words',
  'zjueh.mastered',
  'zjueh.settings',
  'zjueh.prefs',
  'zjueh.speech',
  'zjueh.word-stats',
  'zjueh.day-stats',
] as const

class StorageSchemaError extends Error {
  constructor(public readonly key: string, message: string) {
    super(message)
    this.name = 'StorageSchemaError'
  }
}

function isCards(value: unknown): value is SenseCard[] {
  if (!Array.isArray(value)) return false
  const seen = new Set<string>()
  return value.every((card: unknown) => {
    if (!hasFields(card, ['english', 'sense', 'senses']) || !isText(card.english) ||
        !isSense(card.sense) || !Array.isArray(card.senses) || card.senses.length === 0 ||
        !card.senses.every(isSense) || seen.has(card.english)) return false
    const current = card.sense
    if (!card.senses.some((s) => s.pos === current.pos && s.zh === current.zh && s.en === current.en &&
      s.examples.length === current.examples.length && s.examples.every((e, i) => e === current.examples[i]))) return false
    seen.add(card.english)
    return true
  })
}

function isSettings(value: unknown): value is Settings {
  return hasFields(value, Object.keys(DEFAULT_SETTINGS)) && isId(value.bookId) &&
    Array.isArray(value.units) && value.units.every(isId) && new Set(value.units).size === value.units.length &&
    isOneOf(value.contentFilter, CONTENT_FILTERS) && isOneOf(value.orderMode, ORDER_MODES) &&
    isOneOf(value.questionMode, QUESTION_MODES) && isOneOf(value.mergeMode, MERGE_MODES) &&
    typeof value.showFirstLetter === 'boolean'
}

function isPrefs(value: unknown): value is StoredData['zjueh.prefs'] {
  const fields = Object.keys(DEFAULT_PREFS)
  return hasFields(value, fields) &&
    (value.voiceURI === null || isText(value.voiceURI)) &&
    typeof value.rate === 'number' && Number.isFinite(value.rate) && value.rate >= 0.5 && value.rate <= 1.5 &&
    isOneOf(value.enMode, EN_MODES) && isOneOf(value.exampleMode, EXAMPLE_MODES) &&
    typeof value.keySound === 'boolean' &&
    typeof value.practiceTts === 'boolean'
}

function isSpeechSettings(value: unknown): value is StoredData['zjueh.speech'] {
  return hasFields(value, Object.keys(DEFAULT_SPEECH_SETTINGS)) &&
    isOneOf(value.provider, SPEECH_PROVIDER_IDS)
}

function isWordStats(value: unknown): value is Record<string, WordStat> {
  return isRecord(value) && Object.entries(value).every(([word, stat]) =>
    isText(word) && !["__proto__", "constructor", "prototype"].includes(word) &&
    hasFields(stat, ['attempts', 'wrongs', 'lastSeen', 'lastWrong']) &&
    isCount(stat.attempts) && isCount(stat.wrongs) && stat.wrongs <= stat.attempts &&
    isCount(stat.lastSeen) && isCount(stat.lastWrong) && stat.lastWrong <= stat.lastSeen)
}

function isDayStats(value: unknown): value is Record<string, DayStat> {
  return isRecord(value) && Object.entries(value).every(([date, stat]) =>
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    new Date(`${date}T00:00:00.000Z`).toJSON()?.slice(0, 10) === date &&
    hasFields(stat, ['words', 'correct', 'ms']) && isCount(stat.words) &&
    isCount(stat.correct) && stat.correct <= stat.words && isCount(stat.ms))
}

export const STORAGE_VALIDATORS: { [K in keyof StoredData]: (value: unknown) => value is StoredData[K] } = {
  'zjueh.wrong-words': isCards,
  'zjueh.mastered': isCards,
  'zjueh.settings': isSettings,
  'zjueh.prefs': isPrefs,
  'zjueh.speech': isSpeechSettings,
  'zjueh.word-stats': isWordStats,
  'zjueh.day-stats': isDayStats,
}

function read<K extends keyof StoredData>(key: K): StoredData[K] | undefined {
  const raw = localStorage.getItem(key)
  if (raw === null) return undefined
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new StorageSchemaError(key, `本地数据损坏：${key}`)
  }
  if (!STORAGE_VALIDATORS[key](value)) throw new StorageSchemaError(key, `本地数据版本不匹配：${key}`)
  return value
}

function write<K extends keyof StoredData>(key: K, value: StoredData[K]) {
  localStorage.setItem(key, JSON.stringify(value))
}

function loadCollection<K extends 'zjueh.wrong-words' | 'zjueh.mastered'>(key: K): SenseCard[] {
  const value = read(key)
  if (value === undefined) return []
  return value
}

function loadRecord<K extends 'zjueh.word-stats' | 'zjueh.day-stats'>(key: K): StoredData[K] {
  const value = read(key)
  if (value === undefined) return {}
  return value
}

export function loadWrongWords(): SenseCard[] {
  return loadCollection('zjueh.wrong-words')
}

export function saveWrongWords(words: SenseCard[]) {
  write('zjueh.wrong-words', words)
}

export function loadMastered(): SenseCard[] {
  return loadCollection('zjueh.mastered')
}

export function saveMastered(words: SenseCard[]) {
  write('zjueh.mastered', words)
}

export function loadWordStats(): Record<string, WordStat> {
  return loadRecord('zjueh.word-stats')
}

export function saveWordStats(stats: Record<string, WordStat>) {
  write('zjueh.word-stats', stats)
}

export function loadDayStats(): Record<string, DayStat> {
  return loadRecord('zjueh.day-stats')
}

export function saveDayStats(days: Record<string, DayStat>) {
  write('zjueh.day-stats', days)
}

export function loadSettings(): Settings {
  const value = read('zjueh.settings')
  if (value === undefined) {
    const initial = { ...DEFAULT_SETTINGS, units: [] }
    write('zjueh.settings', initial)
    return initial
  }
  return value
}

export function saveSettings(settings: Settings) {
  write('zjueh.settings', settings)
}

export function loadPrefs(): Prefs {
  try {
    const value = read('zjueh.prefs')
    if (value === undefined) {
      write('zjueh.prefs', DEFAULT_PREFS)
      return DEFAULT_PREFS
    }
    return value
  } catch (error: unknown) {
    if (!(error instanceof StorageSchemaError) || error.key !== 'zjueh.prefs') throw error
    localStorage.removeItem('zjueh.prefs')
    write('zjueh.prefs', DEFAULT_PREFS)
    return DEFAULT_PREFS
  }
}

export function savePrefs(prefs: Prefs) {
  write('zjueh.prefs', prefs)
}

export function loadSpeechSettings(): SpeechSettings {
  const value = read('zjueh.speech')
  if (value === undefined) {
    write('zjueh.speech', DEFAULT_SPEECH_SETTINGS)
    return DEFAULT_SPEECH_SETTINGS
  }
  return value
}

export function saveSpeechSettings(settings: SpeechSettings) {
  write('zjueh.speech', settings)
}

/** 用户主动重置失效的偏好数据；不迁移旧字段，也不影响学习记录。 */
export function resetPrefs() {
  localStorage.removeItem('zjueh.prefs')
}

/** 用户主动重置当前 schema；不执行迁移，也不触碰主题偏好。 */
export function resetUserData() {
  for (const key of USER_DATA_KEYS) localStorage.removeItem(key)
}
