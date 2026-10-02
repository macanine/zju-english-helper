import { MERGE_MODES, type MergeMode, type SenseCard, type Sense } from './model'

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

/** 个性化偏好（设置页） */
export interface Prefs {
  /** TTS 语音 voiceURI；null = 自动（英音女声优先） */
  voiceURI: string | null
  /** TTS 语速 */
  rate: number
  /** 英文解释：常显 / 默认收起（可展开）/ 隐藏 */
  enMode: EnMode
  /** 例句：常显 / 默认收起（点词块展开）/ 隐藏 */
  exampleMode: ExampleMode
  /** @deprecated 旧版设置字段，仅为兼容已保存的偏好数据保留 */
  autoSpeak: boolean
  /** 打字音效（按键 / 错误 / 完成） */
  keySound: boolean
}

export const DEFAULT_PREFS: Prefs = {
  voiceURI: null,
  rate: 0.9,
  enMode: 'collapsible',
  exampleMode: 'always',
  autoSpeak: false,
  keySound: true,
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

const WRONG_KEY = 'zjueh.wrong-words'
const SETTINGS_KEY = 'zjueh.settings'
const PREFS_KEY = 'zjueh.prefs'
const WORD_STATS_KEY = 'zjueh.word-stats'
const DAY_STATS_KEY = 'zjueh.day-stats'
const MASTERED_KEY = 'zjueh.mastered'

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 隐私模式 / 存储被禁用时忽略，功能降级为不记忆 */
  }
}

/** 旧版错题本迁移：v1 词条 { english, chinese, examples } → 卡片。
    chinese 是「英文释义+中文释义」混合文本，按第一个汉字 / 全角字符拆开 */
function migrateLegacyWord(raw: Record<string, unknown>): SenseCard | null {
  const english = typeof raw.english === 'string' ? raw.english : ''
  const chinese = typeof raw.chinese === 'string' ? raw.chinese : ''
  const examples = typeof raw.examples === 'string' ? raw.examples : ''
  if (!english) return null
  const def = chinese.replace(/\[[^\[\]]*\]/g, '').trim()
  const m = def.match(/[\u4e00-\u9fff\u3000-\u303f\uff01-\uff60]/)
  const zh = m ? def.slice(m.index).trim() : ''
  const en = m ? def.slice(0, m.index).trim() : def
  const sense: Sense = {
    pos: null,
    zh,
    en,
    examples: examples
      .split('；')
      .map((s) => s.replace(/^e\.g\.\s*/i, '').trim())
      .filter(Boolean),
  }
  return { english, sense, senses: [sense] }
}

/** 存储里的一条释义（词性 v3 起在释义上，旧版存在卡片上，读取时搬进来） */
function parseSense(raw: unknown, cardPos: unknown): Sense | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  const zh = typeof s.zh === 'string' ? s.zh : ''
  const en = typeof s.en === 'string' ? s.en : ''
  const examples = Array.isArray(s.examples)
    ? s.examples.filter((e): e is string => typeof e === 'string')
    : []
  if (!zh && !en && examples.length === 0) return null
  return {
    pos: typeof s.pos === 'string' ? s.pos : typeof cardPos === 'string' ? cardPos : null,
    zh,
    en,
    examples,
  }
}

/**
 * 存储里的卡片列表解析：跳过损坏项，旧版 v1 数据自动迁移。
 * 记录以**单词**为单位，同一个词的旧记录（以前按释义各存一条）会合并成一条。
 */
function parseCards(data: unknown): SenseCard[] {
  if (!Array.isArray(data)) return []
  const byWord = new Map<string, SenseCard>()
  const add = (english: string, senses: Sense[]) => {
    if (!english || senses.length === 0) return
    const hit = byWord.get(english)
    if (!hit) {
      byWord.set(english, { english, sense: senses[0], senses: [...senses] })
      return
    }
    for (const sense of senses) {
      if (!hit.senses.some((s) => s.zh === sense.zh && s.en === sense.en)) hit.senses.push(sense)
    }
  }

  for (const item of data) {
    if (!item || typeof item !== 'object') continue
    const raw = item as Record<string, unknown>
    if ('chinese' in raw) {
      const migrated = migrateLegacyWord(raw)
      if (migrated) add(migrated.english, migrated.senses)
      continue
    }
    if (typeof raw.english !== 'string') continue
    const list = Array.isArray(raw.senses)
      ? raw.senses.map((s) => parseSense(s, raw.pos))
      : [parseSense(raw.sense, raw.pos)]
    add(
      raw.english,
      list.filter((s): s is Sense => s !== null)
    )
  }
  return [...byWord.values()]
}

export function loadWrongWords(): SenseCard[] {
  return parseCards(read<unknown[]>(WRONG_KEY))
}

export function saveWrongWords(words: SenseCard[]) {
  write(WRONG_KEY, words)
}

/** 已掌握的词（从练习与复习中排除；可取消掌握） */
export function loadMastered(): SenseCard[] {
  return parseCards(read<unknown[]>(MASTERED_KEY))
}

export function saveMastered(words: SenseCard[]) {
  write(MASTERED_KEY, words)
}

/**
 * 单词级学习记录，key 就是单词本身。
 * 旧版按「单词 + 释义」存（key 里带 `\u0000释义`），读取时合并到单词上。
 */
export function loadWordStats(): Record<string, WordStat> {
  const data = read<Record<string, WordStat>>(WORD_STATS_KEY)
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
  const out: Record<string, WordStat> = {}
  for (const [key, stat] of Object.entries(data)) {
    if (!stat || typeof stat !== 'object') continue
    const english = key.split('\u0000')[0]
    if (!english) continue
    const prev = out[english]
    out[english] = {
      attempts: (prev?.attempts ?? 0) + (Number(stat.attempts) || 0),
      wrongs: (prev?.wrongs ?? 0) + (Number(stat.wrongs) || 0),
      lastSeen: Math.max(prev?.lastSeen ?? 0, Number(stat.lastSeen) || 0),
      lastWrong: Math.max(prev?.lastWrong ?? 0, Number(stat.lastWrong) || 0),
    }
  }
  return out
}

export function saveWordStats(stats: Record<string, WordStat>) {
  write(WORD_STATS_KEY, stats)
}

export function loadDayStats(): Record<string, DayStat> {
  const data = read<Record<string, DayStat>>(DAY_STATS_KEY)
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {}
}

export function saveDayStats(days: Record<string, DayStat>) {
  write(DAY_STATS_KEY, days)
}

export function loadSettings(): Settings {
  const saved = read<Partial<Settings>>(SETTINGS_KEY) ?? {}
  // 兼容旧版本存过 'unit1-1.csv' 后缀的历史数据
  const units = Array.isArray(saved.units)
    ? saved.units.map((u) => u.replace(/\.csv$/, ''))
    : DEFAULT_SETTINGS.units
  return { ...DEFAULT_SETTINGS, ...saved, units }
}

export function saveSettings(settings: Settings) {
  write(SETTINGS_KEY, settings)
}

export function loadPrefs(): Prefs {
  // 旧版本存的是 showEn: boolean（是否显示英文释义），读取时映射到三态 enMode
  const saved = read<Partial<Prefs> & { showEn?: boolean }>(PREFS_KEY) ?? {}
  const { showEn, ...rest } = saved
  const merged: Prefs = { ...DEFAULT_PREFS, ...rest }
  // 只认存过的合法值；没存过（或存坏了）才看旧字段 / 默认值
  if (!EN_MODES.includes(rest.enMode as EnMode)) {
    merged.enMode =
      typeof showEn === 'boolean' ? (showEn ? 'always' : 'hidden') : DEFAULT_PREFS.enMode
  }
  if (!EXAMPLE_MODES.includes(rest.exampleMode as ExampleMode)) {
    // 早期两态（show / hide）迁移到三态
    const legacy = rest.exampleMode as string
    merged.exampleMode =
      legacy === 'show' ? 'always' : legacy === 'hide' ? 'hidden' : DEFAULT_PREFS.exampleMode
  }
  return merged
}

export function savePrefs(prefs: Prefs) {
  write(PREFS_KEY, prefs)
}
