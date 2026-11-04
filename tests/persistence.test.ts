import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { deferSave, discardPendingSaves, flushPendingSaves, getSaveError } from '../lib/persistence'
import { GameEngine } from '../lib/engine'
import { buildCards } from '../lib/model'
import { buildBackup } from '../lib/backup'
import { DEFAULT_SETTINGS, resetUserData } from '../lib/storage'

const page = new EventTarget()
const documentEvents = new EventTarget()
let visibilityState = 'visible'
let frame: FrameRequestCallback | null = null
const store = new Map<string, string>()
const writes: string[] = []

beforeEach(() => {
  discardPendingSaves()
  store.clear()
  writes.length = 0
  frame = null
  visibilityState = 'visible'
  Object.assign(globalThis, {
    window: {
      addEventListener: page.addEventListener.bind(page),
      requestAnimationFrame: (callback: FrameRequestCallback) => { frame = callback; return 1 },
      cancelAnimationFrame: () => { frame = null },
    },
    document: {
      get visibilityState() { return visibilityState },
      addEventListener: documentEvents.addEventListener.bind(documentEvents),
    },
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { writes.push(key); store.set(key, value) },
      removeItem: (key: string) => store.delete(key),
    },
  })
})
afterEach(() => { discardPendingSaves() })

test('同一键合并更新，绘制前不保存，绘制后的任务才保存', async () => {
  const saved: number[] = []
  deferSave('stats', () => { saved.push(1) })
  deferSave('stats', () => { saved.push(2) })
  assert.deepEqual(saved, [])
  assert.ok(frame)
  frame(0)
  assert.deepEqual(saved, [])
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.deepEqual(saved, [2])
})

test('切后台和 pagehide 保存待写入数据', () => {
  let count = 0
  deferSave('stats', () => { count++ })
  visibilityState = 'hidden'
  documentEvents.dispatchEvent(new Event('visibilitychange'))
  assert.equal(count, 1)
  visibilityState = 'visible'
  deferSave('stats', () => { count++ })
  page.dispatchEvent(new Event('pagehide'))
  assert.equal(count, 2)
})

test('写入失败明确暴露且保留待保存任务，重试后清除错误', () => {
  let failing = true
  let count = 0
  deferSave('stats', () => {
    if (failing) throw new Error('QuotaExceededError')
    count++
  })
  assert.throws(flushPendingSaves, /QuotaExceededError/)
  assert.match(getSaveError()!.message, /QuotaExceededError/)
  failing = false
  flushPendingSaves()
  assert.equal(count, 1)
  assert.equal(getSaveError(), null)
  flushPendingSaves()
  assert.equal(count, 1)
})

test('连续作答先推进，统计和错题各只写一次，备份包含最新记录', () => {
  const cards = buildCards(['apple', 'banana'].map((english) => ({
    english, senses: [{ pos: null, zh: '水果', en: '', examples: [] }],
  })), 'sense')
  const engine = new GameEngine()
  engine.startSession(cards, DEFAULT_SETTINGS, 'test')
  engine.checkAnswer('x')
  engine.checkAnswer('banana')
  assert.equal(engine.index, 2)
  assert.deepEqual(writes, [])
  const backup = buildBackup()
  assert.equal(writes.length, 3)
  assert.equal(new Set(writes).size, 3)
  assert.deepEqual(backup.data['zjueh.word-stats'], engine.allWordStats())
  assert.equal((backup.data['zjueh.review-notebook'] as { word: { english: string } }[])[0].word.english, cards[0].english)
})

test('重置取消待保存任务，旧记录不会在清空后被重新写回', () => {
  deferSave('stats', () => localStorage.setItem('zjueh.word-stats', '{}'))
  resetUserData()
  flushPendingSaves()
  assert.deepEqual(writes, [])
})
