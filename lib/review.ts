import { isWordEntry, type WordEntry } from './model'
import { hasFields, isCount, isId, isOneOf, isText } from './validation'

export const REVIEW_INTERVALS = [1, 2, 4, 7, 15, 30] as const
export const REVIEW_BATCH_SIZE = 20
export interface WordOrigin { bookId: string; unitId: string }
export interface ReviewSchedule {
  status: 'active' | 'consolidated' | 'paused'
  stage: number
  dueAt: number
  lastReviewedAt: number | null
  lapseCount: number
  revision: number
}
export interface ReviewEvent {
  id: string
  at: number
  result: 'success' | 'relearn'
  fromStage: number
  toStage: number
  dueAt: number
  assisted: boolean
}
export interface ReviewItem {
  word: WordEntry
  origins: WordOrigin[]
  addedAt: number
  updatedAt: number
  favoriteAt: number | null
  manuallyAddedAt: number | null
  firstWrongAt: number | null
  note: string
  schedule: ReviewSchedule | null
  history: ReviewEvent[]
}
const timestamp = (value: unknown): value is number => isCount(value) && value <= 8_640_000_000_000_000
const nullableTime = (value: unknown) => value === null || timestamp(value)
const stage = (value: unknown) => isCount(value) && value <= REVIEW_INTERVALS.length

export function isReviewNotebook(value: unknown): value is ReviewItem[] {
  if (!Array.isArray(value)) return false
  const seen = new Set<string>()
  return value.every((item: unknown) => {
    if (!hasFields(item, ['word', 'origins', 'addedAt', 'updatedAt', 'favoriteAt', 'manuallyAddedAt', 'firstWrongAt', 'note', 'schedule', 'history']) ||
      !isWordEntry(item.word) || seen.has(item.word.english) ||
      !timestamp(item.addedAt) || !timestamp(item.updatedAt) || item.updatedAt < item.addedAt ||
      !nullableTime(item.favoriteAt) || !nullableTime(item.manuallyAddedAt) || !nullableTime(item.firstWrongAt) ||
      typeof item.note !== 'string' || item.note.length > 2000 || !Array.isArray(item.origins) ||
      !item.origins.every((o: unknown) => hasFields(o, ['bookId', 'unitId']) && isId(o.bookId) && isId(o.unitId))) return false
    if (new Set(item.origins.map(o => `${o.bookId}/${o.unitId}`)).size !== item.origins.length) return false
    const s = item.schedule
    if (s !== null && (!hasFields(s, ['status', 'stage', 'dueAt', 'lastReviewedAt', 'lapseCount', 'revision']) ||
      !isOneOf(s.status, ['active', 'consolidated', 'paused']) || !stage(s.stage) || !timestamp(s.dueAt) ||
      !nullableTime(s.lastReviewedAt) || !isCount(s.lapseCount) || !isCount(s.revision) ||
      (s.status === 'consolidated' && s.stage !== 6))) return false
    if (!Array.isArray(item.history) || item.history.length > 30 || !item.history.every((e: unknown) =>
      hasFields(e, ['id', 'at', 'result', 'fromStage', 'toStage', 'dueAt', 'assisted']) &&
      isText(e.id) && timestamp(e.at) && isOneOf(e.result, ['success', 'relearn']) &&
      stage(e.fromStage) && stage(e.toStage) && timestamp(e.dueAt) && typeof e.assisted === 'boolean')) return false
    if (new Set(item.history.map(e => e.id)).size !== item.history.length) return false
    seen.add(item.word.english)
    return true
  })
}

export function newReviewItem(word: WordEntry, now: number): ReviewItem {
  return { word: { english: word.english, senses: word.senses }, origins: [], addedAt: now, updatedAt: now,
    favoriteAt: null, manuallyAddedAt: null, firstWrongAt: null, note: '', schedule: null, history: [] }
}
export function initialSchedule(now: number, revision = 0): ReviewSchedule {
  return { status: 'active', stage: 0, dueAt: now, lastReviewedAt: null, lapseCount: 0, revision }
}
export function isDue(item: ReviewItem, now: number): boolean {
  return item.schedule?.status === 'active' && item.schedule.dueAt <= now
}

/** 事件去重；失败总是重学，只有到期、无提示的计划复习可以升级。 */
export function applyReview(item: ReviewItem, event: {
  id: string; now: number; success: boolean; assisted: boolean; canAdvance: boolean; expectedRevision?: number
}): ReviewItem {
  if (item.history.some(e => e.id === event.id)) return item
  const previous = item.schedule
  if (event.success && (!event.canAdvance || event.assisted || !isDue(item, event.now) ||
    (event.expectedRevision !== undefined && previous?.revision !== event.expectedRevision))) return item
  const s = previous ?? initialSchedule(event.now)
  const nextStage = event.success ? Math.min(s.stage + 1, 6) : 0
  const consolidated = event.success && s.stage === 6
  const dueAt = consolidated ? s.dueAt : event.now + (event.success ? REVIEW_INTERVALS[nextStage - 1] * 86_400_000 : previous ? 600_000 : 0)
  return {
    ...item, updatedAt: event.now,
    firstWrongAt: event.success ? item.firstWrongAt : item.firstWrongAt ?? event.now,
    schedule: { status: consolidated ? 'consolidated' : 'active', stage: nextStage, dueAt,
      lastReviewedAt: event.now, lapseCount: s.lapseCount + (event.success ? 0 : 1), revision: s.revision + 1 },
    history: [...item.history, { id: event.id, at: event.now, result: event.success ? 'success' as const : 'relearn' as const,
      fromStage: s.stage, toStage: nextStage, dueAt, assisted: event.assisted }].slice(-30),
  }
}

/** 只转换上一版的完整词卡；同词错题优先，来源不猜测。 */
export function upgradeCards(wrong: WordEntry[], mastered: WordEntry[], now: number): ReviewItem[] {
  const items = new Map<string, ReviewItem>()
  for (const word of mastered) items.set(word.english, {
    ...newReviewItem(word, now), firstWrongAt: now,
    schedule: { ...initialSchedule(now), status: 'consolidated', stage: 6 },
  })
  for (const word of wrong) items.set(word.english, {
    ...newReviewItem(word, now), firstWrongAt: now, schedule: initialSchedule(now),
  })
  return [...items.values()]
}

export function dueLabel(item: ReviewItem, now: number): string {
  const s = item.schedule
  if (!s) return '未加入计划'
  if (s.status === 'paused') return '已暂停'
  if (s.status === 'consolidated') return '已稳固'
  if (s.dueAt <= now) return '现在复习'
  const date = new Date(s.dueAt)
  if (date.toDateString() === new Date(now).toDateString()) return `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1)
  if (date.toDateString() === tomorrow.toDateString()) return '明天复习'
  return `${date.toLocaleDateString('zh-CN')} 复习`
}
