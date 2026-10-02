import { hasUsableExamples, type SenseCard } from './model'
import { dayKey, recordAnswer } from './stats'
import {
  loadDayStats,
  loadMastered,
  loadWordStats,
  loadWrongWords,
  saveDayStats,
  saveMastered,
  saveWordStats,
  saveWrongWords,
  type DayStat,
  type QuestionMode,
  type SessionOptions,
  type WordStat,
} from './storage'
import type { SessionStats } from './session'

export type NextQuestion =
  | { kind: 'question'; word: SenseCard }
  | { kind: 'done' }
  | { kind: 'no-examples' }

/** 单词空闲计时上限：中途离开页面时避免把挂机时间算进练习用时 */
const MAX_ANSWER_MS = 180_000

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const EMPTY_WORD_STAT: WordStat = { attempts: 0, wrongs: 0, lastSeen: 0, lastWrong: 0 }

/**
 * 复习队列排序：错得多的先复习，其次久未答错的先，最后保持原顺序（稳定）。
 * 对应 typewords 的「错词优先、久未复习优先」思路，但只依赖本地记录，不需要算法库。
 */
export function orderForReview(
  cards: SenseCard[],
  stats: Record<string, WordStat>
): SenseCard[] {
  return cards
    .map((card, i) => ({ card, i }))
    .sort((a, b) => {
      const sa = stats[a.card.english] ?? EMPTY_WORD_STAT
      const sb = stats[b.card.english] ?? EMPTY_WORD_STAT
      if (sa.wrongs !== sb.wrongs) return sb.wrongs - sa.wrongs
      if (sa.lastWrong !== sb.lastWrong) return sa.lastWrong - sb.lastWrong
      return a.i - b.i
    })
    .map((x) => x.card)
}

/**
 * 一次练习会话的核心状态，错题本持久化到 localStorage。
 * 实例由 getEngine() 提供单例：路由切换时牌组与进度不丢。
 */
export class GameEngine {
  /** 当前牌组；index 为下一个待答词的下标 */
  deck: SenseCard[] = []
  index = 0
  /** 当前会话的 URL 查询串，用于路由来回切换时判断能否续做 */
  sessionKey: string | null = null
  questionMode: QuestionMode = 'word'
  showFirstLetter = false

  private wrongMap = new Map<string, SenseCard>()
  /** 已掌握的词：不再进入练习与复习队列 */
  private masteredMap = new Map<string, SenseCard>()
  /** 单词级学习记录（错误次数 / 最近作答），用于复习排序与错题本展示 */
  private wordStats: Record<string, WordStat> = {}
  /** 每日练习记录（今日概览 / 连续天数） */
  private days: Record<string, DayStat> = {}
  private listeners = new Set<() => void>()
  private firstTryCorrect = 0
  private startedAt = 0
  /** 上一题的作答时刻，用于把两次作答的间隔累计为练习用时 */
  private lastTick = 0

  constructor() {
    for (const w of loadWrongWords()) {
      this.wrongMap.set(w.english, w)
    }
    for (const w of loadMastered()) {
      this.masteredMap.set(w.english, w)
    }
    this.wordStats = loadWordStats()
    this.days = loadDayStats()
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify() {
    this.listeners.forEach((l) => l())
  }

  private persist() {
    saveWrongWords([...this.wrongMap.values()])
  }

  get wrongWords(): SenseCard[] {
    return [...this.wrongMap.values()]
  }

  get wrongCount(): number {
    return this.wrongMap.size
  }

  get masteredWords(): SenseCard[] {
    return [...this.masteredMap.values()]
  }

  get masteredCount(): number {
    return this.masteredMap.size
  }

  isMastered(card: SenseCard): boolean {
    return this.masteredMap.has(card.english)
  }

  /** 标记已掌握：移出错题本，之后不再进入练习与复习 */
  masterWord(card: SenseCard) {
    const key = card.english
    this.masteredMap.set(key, card)
    this.wrongMap.delete(key)
    saveMastered(this.masteredWords)
    this.persist()
    this.notify()
  }

  /** 取消已掌握：放回错题本（已掌握列表只从错题本进入，说明它本来就错过） */
  unmasterWord(card: SenseCard) {
    const key = card.english
    if (!this.masteredMap.delete(key)) return
    this.wrongMap.set(key, card)
    saveMastered(this.masteredWords)
    this.persist()
    this.notify()
  }

  wordStat(card: SenseCard): WordStat {
    return this.wordStats[card.english] ?? EMPTY_WORD_STAT
  }

  allWordStats(): Record<string, WordStat> {
    return { ...this.wordStats }
  }

  dayStats(): Record<string, DayStat> {
    return { ...this.days }
  }

  /** 本会话已用时（结果页与练习页计时共用同一来源） */
  elapsedMs(): number {
    return this.startedAt ? Date.now() - this.startedAt : 0
  }

  /** 开始练习：按内容过滤 + 排序生成牌组；返回牌组词数（0 表示过滤后没有可练的词） */
  startSession(allCards: SenseCard[], options: SessionOptions, sessionKey: string): number {
    let deck = allCards.filter((w) => !this.masteredMap.has(w.english))
    if (options.contentFilter === 'words_only') {
      deck = deck.filter((w) => !w.english.includes(' '))
    } else if (options.contentFilter === 'phrases_only') {
      deck = deck.filter((w) => w.english.includes(' '))
    }
    this.deck = options.orderMode === 'random' ? shuffle(deck) : [...deck]
    this.index = 0
    this.questionMode = options.questionMode
    this.showFirstLetter = options.showFirstLetter
    this.sessionKey = sessionKey
    this.firstTryCorrect = 0
    this.startedAt = Date.now()
    this.lastTick = this.startedAt
    return this.deck.length
  }

  /** 错题本复习：错得最多 / 最久没答对的排前面，强制单词模式 + 首字母提示；
      开始时清空错题本（答错会重新加入） */
  startReview(sessionKey: string): boolean {
    if (this.wrongMap.size === 0) return false
    const queue = this.wrongWords.filter((w) => !this.masteredMap.has(w.english))
    if (queue.length === 0) return false
    this.deck = orderForReview(queue, this.wordStats)
    this.wrongMap = new Map()
    this.persist()
    this.questionMode = 'word'
    this.showFirstLetter = true
    this.index = 0
    this.sessionKey = sessionKey
    this.firstTryCorrect = 0
    this.startedAt = Date.now()
    this.lastTick = this.startedAt
    this.notify()
    return true
  }

  /** 该会话是否还有未答的题（是则回到练习页时直接续做，不重新开一局） */
  isActive(sessionKey: string): boolean {
    return this.sessionKey === sessionKey && this.index < this.deck.length
  }

  /**
   * 获取下一个有效问题。例句模式下自动跳过没有 [[..]] 标记的词条。
   */
  nextQuestion(): NextQuestion {
    const total = this.deck.length
    let scanned = 0
    while (this.index < total) {
      const word = this.deck[this.index]
      const valid = this.questionMode !== 'example' || hasUsableExamples(word)
      if (valid) return { kind: 'question', word }
      this.index++
      scanned++
    }
    // 从头扫完整副牌组都没有有效例句 → 数据问题；
    // 只是尾部若干无效词越过了结尾 → 正常完成
    if (scanned >= total && total > 0) return { kind: 'no-examples' }
    return { kind: 'done' }
  }

  currentWord(): SenseCard | null {
    return this.index < this.deck.length ? this.deck[this.index] : null
  }

  /**
   * 判定答案；无论对错都推进到下一个词。
   * opts.expected：例句模式下空缺处的变形词（默认比对词条原形）。
   * opts.markWrong：即使输入匹配也强制记入错题本（打字模式：过程中出现过错误）。
   */
  checkAnswer(
    userInput: string,
    opts?: { expected?: string; markWrong?: boolean }
  ): boolean {
    const word = this.currentWord()
    if (!word) return false
    const correct = (opts?.expected ?? word.english).toLowerCase()
    const isCorrect = userInput.trim().toLowerCase() === correct
    const firstTry = isCorrect && !opts?.markWrong
    if (firstTry) {
      this.firstTryCorrect++
    } else {
      this.wrongMap.set(word.english, word)
      this.persist()
    }
    this.recordAnswer(word, firstTry)
    this.index++
    this.notify()
    return isCorrect
  }

  /** 单词级记录 + 当日练习记录（用时按两次作答的间隔累计，单题封顶 MAX_ANSWER_MS） */
  private recordAnswer(card: SenseCard, firstTry: boolean) {
    const now = Date.now()
    const key = card.english
    const prev = this.wordStats[key] ?? EMPTY_WORD_STAT
    this.wordStats[key] = {
      attempts: prev.attempts + 1,
      wrongs: prev.wrongs + (firstTry ? 0 : 1),
      lastSeen: now,
      lastWrong: firstTry ? prev.lastWrong : now,
    }
    saveWordStats(this.wordStats)

    const elapsed = this.lastTick ? Math.min(Math.max(0, now - this.lastTick), MAX_ANSWER_MS) : 0
    this.lastTick = now
    this.days = recordAnswer(this.days, dayKey(new Date(now)), firstTry, elapsed)
    saveDayStats(this.days)
  }

  /** 跳过当前词，且不计入错题本（如已在错题本中则移除） */
  skipWithoutPenalty(): SenseCard | null {
    const word = this.currentWord()
    if (!word) return null
    const key = word.english
    if (this.wrongMap.has(key)) {
      this.wrongMap.delete(key)
      this.persist()
      this.notify()
    }
    this.index++
    return word
  }

  clearWrongWords() {
    this.wrongMap = new Map()
    this.persist()
    this.notify()
  }

  removeWrongWord(word: SenseCard) {
    this.wrongMap.delete(word.english)
    this.persist()
    this.notify()
  }

  progress(): [number, number] {
    return [this.index, this.deck.length]
  }

  stats(): SessionStats {
    return {
      total: this.deck.length,
      firstTryCorrect: this.firstTryCorrect,
      durationMs: Date.now() - this.startedAt,
    }
  }
}

let instance: GameEngine | null = null

/** 引擎单例；构造函数会读 localStorage，只能在浏览器端（effect / 事件）调用 */
export function getEngine(): GameEngine {
  return (instance ??= new GameEngine())
}
