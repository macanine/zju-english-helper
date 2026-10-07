import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'

import {
  DEFAULT_PREFS,
  DEFAULT_SETTINGS,
  loadPrefs,
  loadSettings,
  loadWordStats,
  loadWrongWords,
  savePrefs,
  saveSettings,
  type Prefs,
} from '../lib/storage'
import type { SenseCard } from '../lib/model'

const store = new Map<string, string>()
Object.assign(globalThis, {
  localStorage: {
    get length() { return store.size },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => void store.set(key, value),
  },
})

beforeEach(() => store.clear())

const card: SenseCard = {
  english: 'apple',
  sense: { pos: 'n.', zh: '苹果', en: 'a fruit', examples: ['I ate an [[apple]].'] },
  senses: [{ pos: 'n.', zh: '苹果', en: 'a fruit', examples: ['I ate an [[apple]].'] }],
}

test('首次读取会初始化当前 schema 的默认设置', () => {
  assert.deepEqual(loadPrefs(), DEFAULT_PREFS)
  assert.deepEqual(loadSettings(), DEFAULT_SETTINGS)
  assert.deepEqual(JSON.parse(store.get('zjueh.prefs')!), DEFAULT_PREFS)
  assert.deepEqual(JSON.parse(store.get('zjueh.settings')!), DEFAULT_SETTINGS)
})

test('当前偏好和练习设置可以原样往返', () => {
  const prefs: Prefs = { ...DEFAULT_PREFS, enMode: 'always', practiceTts: false }
  const settings = { ...DEFAULT_SETTINGS, bookId: 'book3', units: ['unit3-1'] }
  savePrefs(prefs)
  saveSettings(settings)
  assert.deepEqual(loadPrefs(), prefs)
  assert.deepEqual(loadSettings(), settings)
})

test('旧偏好结构会被丢弃并重建当前默认设置', () => {
  store.set('zjueh.prefs', JSON.stringify({ enMode: 'always', rate: 1.1 }))
  assert.deepEqual(loadPrefs(), DEFAULT_PREFS)
  assert.deepEqual(JSON.parse(store.get('zjueh.prefs')!), DEFAULT_PREFS)
})

test('旧错题卡片结构不会被迁移', () => {
  store.set('zjueh.wrong-words', JSON.stringify([{ english: 'apple', chinese: '苹果' }]))
  assert.throws(() => loadWrongWords(), /本地数据版本不匹配：zjueh\.wrong-words/)
})

test('当前错题卡片和统计结构严格读取', () => {
  store.set('zjueh.wrong-words', JSON.stringify([card]))
  store.set('zjueh.word-stats', JSON.stringify({
    apple: { attempts: 2, wrongs: 1, lastSeen: 100, lastWrong: 100 },
  }))
  assert.deepEqual(loadWrongWords(), [card])
  assert.deepEqual(loadWordStats(), {
    apple: { attempts: 2, wrongs: 1, lastSeen: 100, lastWrong: 100 },
  })
})

test('损坏 JSON 不会静默变成空数据', () => {
  store.set('zjueh.word-stats', '{ broken')
  assert.throws(() => loadWordStats(), /本地数据损坏：zjueh\.word-stats/)
})
