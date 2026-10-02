import { MERGE_MODES } from './model'
import {
  CONTENT_FILTERS,
  DEFAULT_SETTINGS,
  ORDER_MODES,
  QUESTION_MODES,
  type SessionOptions,
  type Settings,
} from './storage'

/** 一次练习会话的完整描述 —— 由 URL 查询串承载，可分享、刷新后能恢复 */
export type Session =
  | { kind: 'review' }
  | { kind: 'practice'; bookId: string; units: string[]; options: SessionOptions }

export interface SessionStats {
  /** 牌组总词数（含跳过的） */
  total: number
  /** 首次作答即正确的词数 */
  firstTryCorrect: number
  durationMs: number
}

export function sessionFromSettings(settings: Settings): Session {
  const { bookId, units, ...options } = settings
  return { kind: 'practice', bookId, units, options }
}

function encodeOptions(p: URLSearchParams, o: SessionOptions) {
  // 只写与默认值不同的项，保持链接简短
  if (o.contentFilter !== DEFAULT_SETTINGS.contentFilter) p.set('filter', o.contentFilter)
  if (o.orderMode !== DEFAULT_SETTINGS.orderMode) p.set('order', o.orderMode)
  if (o.questionMode !== DEFAULT_SETTINGS.questionMode) p.set('mode', o.questionMode)
  if (o.mergeMode !== DEFAULT_SETTINGS.mergeMode) p.set('merge', o.mergeMode)
  if (o.showFirstLetter !== DEFAULT_SETTINGS.showFirstLetter) p.set('hint', '1')
}

export function encodeSession(session: Session): string {
  const p = new URLSearchParams()
  if (session.kind === 'review') {
    p.set('review', '1')
    return p.toString()
  }
  p.set('book', session.bookId)
  p.set('units', session.units.join(','))
  encodeOptions(p, session.options)
  return p.toString()
}

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

export function decodeSession(query: string): Session | null {
  const p = new URLSearchParams(query)
  if (p.get('review') === '1') return { kind: 'review' }
  const bookId = p.get('book')
  const units = (p.get('units') ?? '').split(',').filter(Boolean)
  if (!bookId || units.length === 0) return null
  return {
    kind: 'practice',
    bookId,
    units,
    options: {
      contentFilter: pick(p.get('filter'), CONTENT_FILTERS, DEFAULT_SETTINGS.contentFilter),
      orderMode: pick(p.get('order'), ORDER_MODES, DEFAULT_SETTINGS.orderMode),
      questionMode: pick(p.get('mode'), QUESTION_MODES, DEFAULT_SETTINGS.questionMode),
      mergeMode: pick(p.get('merge'), MERGE_MODES, DEFAULT_SETTINGS.mergeMode),
      showFirstLetter: p.get('hint') === '1',
    },
  }
}

function readCount(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function encodeResult(session: Session, stats: SessionStats): string {
  const p = new URLSearchParams(encodeSession(session))
  p.set('total', String(stats.total))
  p.set('first', String(stats.firstTryCorrect))
  p.set('ms', String(Math.max(0, Math.round(stats.durationMs))))
  return p.toString()
}

/** 解析结果页参数；直接访问或链接被改坏时返回 null */
export function decodeResult(query: string): { session: Session; stats: SessionStats } | null {
  const p = new URLSearchParams(query)
  const session = decodeSession(query)
  const total = readCount(p.get('total'))
  const first = readCount(p.get('first'))
  const ms = readCount(p.get('ms'))
  if (!session || total === null || total === 0 || first === null || ms === null) return null
  return { session, stats: { total, firstTryCorrect: first, durationMs: ms } }
}
