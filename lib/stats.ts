import type { DayStat } from './storage'

export const EMPTY_DAY: DayStat = { words: 0, correct: 0, ms: 0 }

/** 本地时区的 YYYY-MM-DD（不能用 toISOString，那按 UTC 算，晚上会串天） */
export function dayKey(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 日期键前后平移 n 天（跨月 / 跨年由 Date 处理） */
export function shiftDay(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number)
  return dayKey(new Date(y, m - 1, d + delta))
}

/** 记一次作答，返回新的 days（不改原对象，方便测试） */
export function recordAnswer(
  days: Record<string, DayStat>,
  key: string,
  correct: boolean,
  ms: number
): Record<string, DayStat> {
  const prev = days[key] ?? EMPTY_DAY
  return {
    ...days,
    [key]: {
      words: prev.words + 1,
      correct: prev.correct + (correct ? 1 : 0),
      ms: prev.ms + Math.max(0, Math.round(ms)),
    },
  }
}

/** 连续练习天数：从今天往前数连续有练习记录的天数（今天还没练则从昨天算起） */
export function streakDays(days: Record<string, DayStat>, today: string = dayKey()): number {
  let cursor = (days[today]?.words ?? 0) > 0 ? today : shiftDay(today, -1)
  let n = 0
  while ((days[cursor]?.words ?? 0) > 0) {
    n++
    cursor = shiftDay(cursor, -1)
  }
  return n
}

/** 最近 n 天（含今天）的记录，按时间升序；缺的日期补空 */
export function recentDays(
  days: Record<string, DayStat>,
  today: string = dayKey(),
  n = 7
): { key: string; stat: DayStat }[] {
  const out: { key: string; stat: DayStat }[] = []
  for (let i = n - 1; i >= 0; i--) {
    const key = shiftDay(today, -i)
    out.push({ key, stat: days[key] ?? EMPTY_DAY })
  }
  return out
}

/** 今日概览：词数 / 正确率 / 用时文案，供首页与结果页共用 */
export function summarizeDay(stat: DayStat): { words: number; accuracy: number | null; durationText: string } {
  const minutes = Math.floor(stat.ms / 60000)
  const seconds = Math.round((stat.ms % 60000) / 1000)
  return {
    words: stat.words,
    accuracy: stat.words > 0 ? Math.round((stat.correct / stat.words) * 100) : null,
    durationText: minutes > 0 ? `${minutes} 分 ${seconds} 秒` : `${seconds} 秒`,
  }
}
