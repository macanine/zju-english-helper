import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'

import {
  DEFAULT_PREFS,
  loadPrefs,
  loadWordStats,
  loadWrongWords,
  savePrefs,
} from '../lib/storage'

/** storage.ts 直接用全局 localStorage，测试里换成内存实现 */
const store = new Map<string, string>()
Object.assign(globalThis, {
  localStorage: {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => void store.set(key, value),
  },
})

beforeEach(() => store.clear())

test('loadPrefs 没存过时给默认值', () => {
  assert.deepEqual(loadPrefs(), DEFAULT_PREFS)
})

test('旧版 showEn 布尔值映射到三态 enMode', () => {
  store.set('zjueh.prefs', JSON.stringify({ showEn: true, rate: 1.1 }))
  const shown = loadPrefs()
  assert.equal(shown.enMode, 'always')
  assert.equal(shown.rate, 1.1)

  store.set('zjueh.prefs', JSON.stringify({ showEn: false }))
  assert.equal(loadPrefs().enMode, 'hidden')
})

test('enMode 合法值原样读取，非法值回退默认', () => {
  store.set('zjueh.prefs', JSON.stringify({ enMode: 'hidden' }))
  assert.equal(loadPrefs().enMode, 'hidden')

  store.set('zjueh.prefs', JSON.stringify({ enMode: 'nope' }))
  assert.equal(loadPrefs().enMode, DEFAULT_PREFS.enMode)

  // 有 showEn 又有非法 enMode 时，按 showEn 迁移
  store.set('zjueh.prefs', JSON.stringify({ enMode: 'nope', showEn: true }))
  assert.equal(loadPrefs().enMode, 'always')
})

test('savePrefs / loadPrefs 往返一致', () => {
  savePrefs({ ...DEFAULT_PREFS, enMode: 'always', autoSpeak: true, keySound: true })
  const prefs = loadPrefs()
  assert.equal(prefs.enMode, 'always')
  assert.equal(prefs.autoSpeak, true)
  assert.equal(prefs.keySound, true)
})

test('旧版按释义存的错题卡片会合并成按词一条', () => {
  store.set(
    'zjueh.wrong-words',
    JSON.stringify([
      { english: 'sprawl', pos: 'v.', senseNo: 1, senseCount: 2, sense: { zh: '杂乱地延伸', en: '', examples: [] } },
      { english: 'sprawl', pos: 'v.', senseNo: 2, senseCount: 2, sense: { zh: '摊开手脚躺着', en: '', examples: [] } },
      { english: 'amid', pos: 'prep.', sense: { zh: '在···之中', en: '', examples: [] } },
    ])
  )
  const cards = loadWrongWords()
  assert.equal(cards.length, 2) // 同词合并
  const sprawl = cards.find((c) => c.english === 'sprawl')!
  assert.deepEqual(
    sprawl.senses.map((s) => s.zh),
    ['杂乱地延伸', '摊开手脚躺着']
  )
  assert.equal(sprawl.sense.zh, '杂乱地延伸') // 首条释义当题面
  assert.equal(sprawl.senses[0].pos, 'v.') // 卡片上的旧词性搬进释义
})

test('v1 数据（chinese 混合文本）仍能迁移成按词一条', () => {
  store.set(
    'zjueh.wrong-words',
    JSON.stringify([{ english: 'apple', chinese: '[C] a fruit 苹果', examples: 'e.g. I ate an [[apple]].' }])
  )
  const cards = loadWrongWords()
  assert.equal(cards.length, 1)
  assert.equal(cards[0].english, 'apple')
  assert.equal(cards[0].sense.zh, '苹果')
  assert.equal(cards[0].sense.en, 'a fruit')
  assert.equal(cards[0].senses.length, 1)
})

test('旧版按释义存的统计 key 合并到单词上', () => {
  store.set(
    'zjueh.word-stats',
    JSON.stringify({
      'sprawl\u0000杂乱地延伸': { attempts: 2, wrongs: 1, lastSeen: 100, lastWrong: 100 },
      'sprawl\u0000摊开手脚躺着': { attempts: 3, wrongs: 2, lastSeen: 300, lastWrong: 200 },
      amid: { attempts: 1, wrongs: 0, lastSeen: 50, lastWrong: 0 },
    })
  )
  const stats = loadWordStats()
  assert.deepEqual(Object.keys(stats).sort(), ['amid', 'sprawl'])
  assert.deepEqual(stats['sprawl'], { attempts: 5, wrongs: 3, lastSeen: 300, lastWrong: 200 })
  assert.deepEqual(stats['amid'], { attempts: 1, wrongs: 0, lastSeen: 50, lastWrong: 0 })
})

test('统计里的坏数据被忽略', () => {
  store.set('zjueh.word-stats', JSON.stringify({ apple: 'nope', banana: { attempts: 1 } }))
  const stats = loadWordStats()
  assert.deepEqual(stats, { banana: { attempts: 1, wrongs: 0, lastSeen: 0, lastWrong: 0 } })
})
