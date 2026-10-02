'use client'

import * as React from 'react'

import { loadManifest, type BookMeta } from './data'
import { getEngine, type GameEngine } from './engine'
import type { SenseCard } from './model'
import {
  loadPrefs,
  loadSettings,
  savePrefs,
  saveSettings,
  type DayStat,
  type Prefs,
  type Settings,
  type WordStat,
} from './storage'

/** 练习引擎单例；构造函数要读 localStorage，因此挂载后才可用（null = 未就绪） */
export function useEngine(): GameEngine | null {
  const [engine, setEngine] = React.useState<GameEngine | null>(null)
  React.useEffect(() => setEngine(getEngine()), [])
  return engine
}

/** 订阅引擎数据的通用钩子：read 必须是模块级稳定函数（否则每次渲染都会重订阅） */
function useEngineValue<T>(read: (engine: GameEngine) => T, fallback: T): T {
  const engine = useEngine()
  const [value, setValue] = React.useState<T>(fallback)

  React.useEffect(() => {
    if (!engine) return
    const sync = () => setValue(read(engine))
    sync()
    return engine.onChange(sync)
  }, [engine, read])

  return value
}

const readWrongWords = (engine: GameEngine) => engine.wrongWords
const readMastered = (engine: GameEngine) => engine.masteredWords
const readWordStats = (engine: GameEngine) => engine.allWordStats()
const readDayStats = (engine: GameEngine) => engine.dayStats()
const EMPTY_CARDS: SenseCard[] = []
const EMPTY_WORD_STATS: Record<string, WordStat> = {}
const EMPTY_DAY_STATS: Record<string, DayStat> = {}

/** 错题本：引擎实例 + 词条列表（随引擎变更实时刷新） */
export function useWrongBook(): { engine: GameEngine | null; words: SenseCard[] } {
  const engine = useEngine()
  const words = useEngineValue(readWrongWords, EMPTY_CARDS)
  return { engine, words }
}

/** 已掌握的词：词条列表（随引擎变更实时刷新） */
export function useMasteredBook(): { engine: GameEngine | null; words: SenseCard[] } {
  const engine = useEngine()
  const words = useEngineValue(readMastered, EMPTY_CARDS)
  return { engine, words }
}

/** 单词级学习记录（错误次数 / 最近作答），key 就是单词本身 */
export function useWordStats(): Record<string, WordStat> {
  return useEngineValue(readWordStats, EMPTY_WORD_STATS)
}

/** 每日练习记录（今日概览 / 连续天数） */
export function useDayStats(): Record<string, DayStat> {
  return useEngineValue(readDayStats, EMPTY_DAY_STATS)
}

/** 词库清单；books 为 null 表示加载中 */
export function useBooks(): { books: BookMeta[] | null; error: string | null } {
  const [books, setBooks] = React.useState<BookMeta[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    loadManifest()
      .then((m) => setBooks(m.books))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }, [])

  return { books, error }
}

/** 练习设置；settings 为 null 表示尚未从 localStorage 读出 */
/** 个性化偏好（TTS 语音 / 语速 / 显示英文释义）；null = 尚未从 localStorage 读出 */
export function usePrefs(): [Prefs | null, (next: Prefs) => void] {
  const [prefs, setPrefs] = React.useState<Prefs | null>(null)

  React.useEffect(() => setPrefs(loadPrefs()), [])

  const update = React.useCallback((next: Prefs) => {
    setPrefs(next)
    savePrefs(next)
  }, [])

  return [prefs, update]
}

export function useSettings(): [Settings | null, (next: Settings) => void] {
  const [settings, setSettings] = React.useState<Settings | null>(null)

  React.useEffect(() => setSettings(loadSettings()), [])

  const update = React.useCallback((next: Settings) => {
    setSettings(next)
    saveSettings(next)
  }, [])

  return [settings, update]
}
