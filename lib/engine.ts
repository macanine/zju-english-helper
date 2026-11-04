import { hasUsableExamples, type SenseCard } from './model'
import { dayKey, recordAnswer } from './stats'
import {
  loadDayStats,
  loadReviewNotebook,
  loadWordStats,
  saveDayStats,
  saveReviewNotebook,
  saveWordStats,
  type DayStat,
  type QuestionMode,
  type SessionOptions,
  type WordStat,
} from './storage'
import type { SessionStats } from './session'
import { deferSave, flushPendingSaves } from './persistence'
import { applyReview, initialSchedule, isDue, newReviewItem, REVIEW_BATCH_SIZE, type ReviewItem, type WordOrigin } from './review'
import type { WordEntry } from './model'
import type { Session } from './session'

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

  private notebook = new Map<string, ReviewItem>()
  private reviewRevisions = new Map<string, number>()
  private reviewedWords = new Set<string>()
  private failedWords = new Set<string>()
  private roundWrong = new Map<string, SenseCard>()
  private skipped = 0
  private canAdvance = false
  private roundId = ''
  private origins = new Map<string, WordOrigin[]>()
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
    for (const item of loadReviewNotebook()) this.notebook.set(item.word.english, item)
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

  private persist(deferred = false) {
    if (deferred) {
      deferSave('review-notebook', () => saveReviewNotebook(this.reviewItems))
    } else {
      flushPendingSaves()
      saveReviewNotebook(this.reviewItems)
    }
  }

  get wrongWords(): SenseCard[] {
    return this.reviewItems.filter(item => item.firstWrongAt !== null && item.schedule?.status === 'active')
      .map(item => ({ ...item.word, sense: item.word.senses[0] }))
  }

  get wrongCount(): number {
    return this.wrongWords.length
  }

  get masteredWords(): SenseCard[] {
    return this.reviewItems.filter(item => item.schedule?.status === 'consolidated')
      .map(item => ({ ...item.word, sense: item.word.senses[0] }))
  }

  get masteredCount(): number {
    return this.masteredWords.length
  }

  isMastered(card: SenseCard): boolean {
    return this.notebook.get(card.english)?.schedule?.status === 'consolidated'
  }

  /** 标记已掌握：移出错题本，之后不再进入练习与复习 */
  masterWord(card: SenseCard) {
    const item = this.ensureItem(card)
    item.schedule = { ...initialSchedule(Date.now(), (item.schedule?.revision ?? 0) + 1), status: 'consolidated', stage: 6 }
    this.persist()
    this.notify()
  }

  /** 取消已掌握：放回错题本（已掌握列表只从错题本进入，说明它本来就错过） */
  unmasterWord(card: SenseCard) {
    this.restartReview(card)
  }

  get reviewItems(): ReviewItem[] { return [...this.notebook.values()] }
  get dueCount(): number { return this.reviewItems.filter(item => isDue(item, Date.now())).length }
  get roundWrongWords(): SenseCard[] { return [...this.roundWrong.values()] }
  get roundSummary() { return { wrong: this.failedWords.size, skipped: this.skipped, remaining: this.dueCount } }
  reviewItem(english: string): ReviewItem | undefined { return this.notebook.get(english) }

  private ensureItem(word: WordEntry, origins: WordOrigin[] = []): ReviewItem {
    const now = Date.now()
    const item = this.notebook.get(word.english) ?? newReviewItem(word, now)
    item.word = { english: word.english, senses: [...new Map([...item.word.senses, ...word.senses]
      .map(sense => [JSON.stringify(sense), sense])).values()] }
    item.origins = [...new Map([...item.origins, ...origins].map(o => [`${o.bookId}/${o.unitId}`, o])).values()]
    item.updatedAt = now
    this.notebook.set(word.english, item)
    return item
  }

  toggleFavorite(word: WordEntry, origins: WordOrigin[] = []) {
    const item = this.ensureItem(word, origins)
    item.favoriteAt = item.favoriteAt === null ? Date.now() : null
    this.persist(true); this.notify()
  }

  focusWord(word: WordEntry) {
    const item = this.ensureItem(word, this.origins.get(word.english))
    item.favoriteAt ??= Date.now()
    item.manuallyAddedAt ??= Date.now()
    if (!item.schedule) item.schedule = initialSchedule(Date.now())
    this.persist(true); this.notify()
  }

  addToReview(word: WordEntry, origins: WordOrigin[] = [], favorite = false) {
    const item = this.ensureItem(word, origins)
    item.manuallyAddedAt ??= Date.now()
    if (favorite) item.favoriteAt ??= Date.now()
    if (!item.schedule) item.schedule = initialSchedule(Date.now())
    else if (item.schedule.status === 'paused') item.schedule = { ...item.schedule, status: 'active', revision: item.schedule.revision + 1 }
    this.persist(true); this.notify()
  }

  pauseReview(english: string) {
    const item = this.notebook.get(english)
    if (!item?.schedule) return
    item.schedule = { ...item.schedule, status: item.schedule.status === 'paused' ? 'active' : 'paused', revision: item.schedule.revision + 1 }
    item.updatedAt = Date.now()
    this.persist(true); this.notify()
  }

  restartReview(word: WordEntry) {
    const item = this.ensureItem(word)
    item.schedule = initialSchedule(Date.now(), (item.schedule?.revision ?? 0) + 1)
    item.manuallyAddedAt ??= Date.now()
    this.persist(true); this.notify()
  }

  saveNote(english: string, note: string) {
    const item = this.notebook.get(english)
    if (!item) return
    item.note = note.slice(0, 2000); item.updatedAt = Date.now()
    this.persist(true); this.notify()
  }

  removeReviewItem(english: string) {
    this.notebook.delete(english)
    this.persist(true); this.notify()
  }

  private beginRound(sessionKey: string) {
    this.index = 0; this.sessionKey = sessionKey; this.firstTryCorrect = 0
    this.startedAt = Date.now(); this.lastTick = this.startedAt
    this.roundId = `${this.startedAt}-${Math.random().toString(36).slice(2)}`
    this.reviewedWords.clear(); this.failedWords.clear(); this.roundWrong.clear(); this.skipped = 0
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
  startSession(allCards: SenseCard[], options: SessionOptions, sessionKey: string, origins = new Map<string, WordOrigin[]>()): number {
    let deck = allCards.filter((w) => options.includeConsolidated || !this.isMastered(w))
    if (options.contentFilter === 'words_only') {
      deck = deck.filter((w) => !w.english.includes(' '))
    } else if (options.contentFilter === 'phrases_only') {
      deck = deck.filter((w) => w.english.includes(' '))
    }
    this.deck = options.orderMode === 'random' ? shuffle(deck) : [...deck]
    this.beginRound(sessionKey)
    this.origins = origins
    this.canAdvance = false
    this.questionMode = options.questionMode
    this.showFirstLetter = options.showFirstLetter
    return this.deck.length
  }

  /** 到期任务按时间排序，每轮取快照；不清空个人复习记录。 */
  startReview(sessionKey: string, session: Extract<Session, { kind: 'review' }> = { kind: 'review' }): boolean {
    const now = Date.now()
    const scope = session.scope ?? 'due'
    if (session.words?.some(word => !this.notebook.has(word))) return false
    const queue = this.reviewItems.filter(item => scope === 'due' ? isDue(item, now) :
      session.words?.length ? session.words.includes(item.word.english) : item.favoriteAt !== null)
      .sort((a, b) => (a.schedule?.dueAt ?? Infinity) - (b.schedule?.dueAt ?? Infinity) ||
        (this.wordStats[b.word.english]?.wrongs ?? 0) - (this.wordStats[a.word.english]?.wrongs ?? 0))
      .slice(0, REVIEW_BATCH_SIZE)
    if (queue.length === 0) return false
    this.deck = queue.map(item => ({ ...item.word, sense: item.word.senses[0] }))
    this.beginRound(sessionKey)
    this.origins = new Map(queue.map(item => [item.word.english, item.origins]))
    this.reviewRevisions = new Map(queue.filter(item => isDue(item, now)).map(item => [item.word.english, item.schedule!.revision]))
    this.canAdvance = scope !== 'extra'
    this.questionMode = 'word'
    this.showFirstLetter = false
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
    opts?: { expected?: string; markWrong?: boolean; assisted?: boolean }
  ): boolean {
    const word = this.currentWord()
    if (!word) return false
    const correct = (opts?.expected ?? word.english).toLowerCase()
    const isCorrect = userInput.trim().toLowerCase() === correct
    const assisted = opts?.assisted === true || this.showFirstLetter
    const firstTry = isCorrect && !opts?.markWrong && !assisted
    if (firstTry) {
      this.firstTryCorrect++
    } else {
      this.failedWords.add(word.english)
      this.roundWrong.set(word.english, word)
    }
    const existing = this.notebook.get(word.english)
    if (!firstTry || existing) {
      const item = this.ensureItem(word, this.origins.get(word.english))
      const next = applyReview(item, { id: `${this.roundId}:${word.english}:${firstTry ? 'success' : 'relearn'}`,
        now: Date.now(), success: firstTry, assisted,
        canAdvance: this.canAdvance && this.reviewRevisions.has(word.english) && !this.failedWords.has(word.english) && !this.reviewedWords.has(word.english),
        expectedRevision: this.reviewRevisions.get(word.english) })
      this.notebook.set(word.english, next)
      this.persist(true)
      if (firstTry && next !== item) this.reviewedWords.add(word.english)
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
    deferSave('word-stats', () => saveWordStats(this.wordStats))

    const elapsed = this.lastTick ? Math.min(Math.max(0, now - this.lastTick), MAX_ANSWER_MS) : 0
    this.lastTick = now
    this.days = recordAnswer(this.days, dayKey(new Date(now)), firstTry, elapsed)
    deferSave('day-stats', () => saveDayStats(this.days))
  }

  /** 跳过不修改复习计划、不删除词条，也不计学习统计。 */
  skipWithoutPenalty(): SenseCard | null {
    const word = this.currentWord()
    if (!word) return null
    this.skipped++
    this.index++
    return word
  }

  clearWrongWords() {
    for (const item of this.reviewItems) if (item.firstWrongAt !== null) this.notebook.delete(item.word.english)
    this.persist()
    this.notify()
  }

  removeWrongWord(word: SenseCard) {
    this.removeReviewItem(word.english)
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
