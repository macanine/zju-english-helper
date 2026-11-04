import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { applyReview, initialSchedule, isDue, isReviewNotebook, newReviewItem, REVIEW_INTERVALS, upgradeCards } from '../lib/review'
import { GameEngine } from '../lib/engine'
import { buildCards } from '../lib/model'
import { DEFAULT_SETTINGS, loadReviewNotebook, saveWrongWords, saveMastered, UPGRADE_BACKUP_KEY } from '../lib/storage'
import { buildBackup, importBackup } from '../lib/backup'
import { encodeSession, decodeSession } from '../lib/session'

const store = new Map<string, string>()
let rejectKey: string | null = null
Object.assign(globalThis, { localStorage: {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { if (key === rejectKey) throw new Error('quota'); store.set(key, value) },
  removeItem: (key: string) => store.delete(key),
} })
beforeEach(() => { store.clear(); rejectKey = null })
const word = { english: 'apple', senses: [{ pos: null, zh: '苹果', en: '', examples: [] }] }
const card = buildCards([word], 'sense')[0]
const now = 1_700_000_000_000

test('到期独立回忆逐级安排完整间隔，最后验证后稳固', () => {
  let item = { ...newReviewItem(word, now), schedule: initialSchedule(now) }
  let time = now
  for (const [index, days] of REVIEW_INTERVALS.entries()) {
    item = applyReview(item, { id: `success-${index}`, now: time, success: true, assisted: false, canAdvance: true }) as typeof item
    assert.equal(item.schedule.stage, index + 1)
    assert.equal(item.schedule.dueAt, time + days * 86_400_000)
    assert.equal(item.schedule.status, 'active')
    time = item.schedule.dueAt
  }
  item = applyReview(item, { id: 'final', now: time, success: true, assisted: false, canAdvance: true }) as typeof item
  assert.equal(item.schedule.status, 'consolidated')
  assert.equal(isDue(item, time), false)
  assert.equal(isReviewNotebook([item]), true)
})

test('提前、提示、额外练习和过期版本不能升级，失败保留收藏并十分钟重学', () => {
  const item = { ...newReviewItem(word, now), favoriteAt: now, schedule: { ...initialSchedule(now), stage: 3, dueAt: now + 1000 } }
  for (const patch of [{ now }, { assisted: true }, { canAdvance: false }, { expectedRevision: 9 }]) {
    assert.equal(applyReview(item, { id: 'success', now: now + 1000, success: true, assisted: false, canAdvance: true, ...patch }), item)
  }
  const failed = applyReview(item, { id: 'failure', now, success: false, assisted: true, canAdvance: false })
  assert.equal(failed.schedule?.stage, 0)
  assert.equal(failed.schedule?.dueAt, now + 600_000)
  assert.equal(failed.favoriteAt, now)
  assert.equal(applyReview(failed, { id: 'failure', now, success: false, assisted: true, canAdvance: false }), failed)
})

test('收藏和计划独立，多来源去重，开始和跳过不删除任务', () => {
  const engine = new GameEngine()
  const origin = [{ bookId: 'book2', unitId: 'unit1' }]
  engine.toggleFavorite(word, origin)
  assert.equal(engine.dueCount, 0)
  engine.addToReview(word, origin)
  assert.equal(engine.reviewItems.length, 1)
  assert.equal(engine.reviewItems[0].origins.length, 1)
  assert.equal(engine.dueCount, 1)
  engine.toggleFavorite(word)
  assert.equal(engine.dueCount, 1)
  engine.startReview('review=1')
  const schedule = { ...engine.reviewItems[0].schedule }
  engine.skipWithoutPenalty()
  assert.deepEqual(engine.reviewItems[0].schedule, schedule)
  assert.equal(engine.dueCount, 1)
  assert.deepEqual(engine.allWordStats(), {})
})

test('同轮多释义错误不被后续正确覆盖，普通练习成功不推进计划', () => {
  const engine = new GameEngine()
  engine.addToReview(word)
  engine.startSession([card, card], DEFAULT_SETTINGS, 'normal')
  engine.checkAnswer('x')
  engine.checkAnswer('apple')
  assert.equal(engine.reviewItems[0].schedule?.stage, 0)
  assert.equal(engine.reviewItems[0].history.length, 1)
  engine.startSession([card], DEFAULT_SETTINGS, 'normal2')
  const before = engine.reviewItems[0].schedule
  engine.checkAnswer('apple')
  assert.deepEqual(engine.reviewItems[0].schedule, before)
})

test('暂停与稳固词失败重新激活；首字母提示不能通过回忆', () => {
  const engine = new GameEngine()
  engine.addToReview(word)
  engine.pauseReview('apple')
  assert.equal(engine.dueCount, 0)
  engine.startSession([card], { ...DEFAULT_SETTINGS, showFirstLetter: true }, 'hint')
  engine.checkAnswer('apple')
  assert.equal(engine.reviewItems[0].schedule?.status, 'active')
  engine.masterWord(card)
  assert.equal(engine.startSession([card], DEFAULT_SETTINGS, 'filtered'), 0)
  engine.startSession([card], { ...DEFAULT_SETTINGS, includeConsolidated: true }, 'included')
  engine.checkAnswer('x')
  assert.equal(engine.reviewItems[0].schedule?.status, 'active')
})

test('升级保存原始备份并保留统计，同词错题优先，重复加载不重置', () => {
  saveWrongWords([card]); saveMastered([card])
  store.set('zjueh.word-stats', JSON.stringify({ apple: { attempts: 2, wrongs: 1, lastSeen: 100, lastWrong: 100 } }))
  const items = loadReviewNotebook()
  assert.equal(items.length, 1)
  assert.equal(items[0].schedule?.status, 'active')
  const original = JSON.parse(store.get(UPGRADE_BACKUP_KEY)!)
  assert.deepEqual(original.data['zjueh.wrong-words'], [card])
  assert.equal(store.has('zjueh.wrong-words'), false)
  assert.deepEqual(loadReviewNotebook(), items)
  assert.ok(store.has('zjueh.word-stats'))
})

test('升级备份或新本写入失败不移除旧数据，重试可成功', () => {
  for (const key of [UPGRADE_BACKUP_KEY, 'zjueh.review-notebook']) {
    store.clear(); saveWrongWords([card]); rejectKey = key
    assert.throws(loadReviewNotebook, /quota/)
    assert.deepEqual(JSON.parse(store.get('zjueh.wrong-words')!), [card])
    rejectKey = null
    assert.equal(loadReviewNotebook().length, 1)
  }
})

test('v3 备份往返保留收藏计划笔记，v2 可以升级，非法阶段拒绝', () => {
  const item = { ...newReviewItem(word, now), favoriteAt: now, note: '记忆笔记', schedule: initialSchedule(now) }
  store.set('zjueh.review-notebook', JSON.stringify([item]))
  const backup = buildBackup(); store.clear()
  assert.equal(importBackup(JSON.stringify(backup)).ok, true)
  assert.deepEqual(loadReviewNotebook(), [item])
  const invalid = { ...backup, data: { 'zjueh.review-notebook': [{ ...item, schedule: { ...item.schedule, stage: 7 } }] } }
  assert.equal(importBackup(JSON.stringify(invalid)).ok, false)
  assert.deepEqual(loadReviewNotebook(), [item])
  assert.equal(upgradeCards([], [word], now)[0].schedule?.status, 'consolidated')
})

test('复习范围、选词及包含稳固词 URL 往返，非法范围拒绝', () => {
  const session = { kind: 'review' as const, scope: 'extra' as const, words: ['look after', 'apple'] }
  assert.deepEqual(decodeSession(encodeSession(session)), session)
  assert.equal(decodeSession('review=1&scope=invalid'), null)
  assert.equal(decodeSession('review=1&scope=selected'), null)
  assert.equal(decodeSession('review=1&words=%5B%22apple%22,%22apple%22%5D'), null)
  const practice = { kind: 'practice' as const, bookId: 'book2', units: ['unit1'], options: { ...DEFAULT_SETTINGS, includeConsolidated: true } }
  assert.equal(decodeSession(encodeSession(practice))?.kind, 'practice')
})

test('同词来自不同单元保留全部释义，陌生选词链接不默默开局', () => {
  const engine = new GameEngine()
  engine.addToReview(word, [{ bookId: 'book2', unitId: 'unit1' }])
  engine.addToReview({ ...word, senses: [{ pos: null, zh: '另一释义', en: '', examples: [] }] }, [{ bookId: 'book2', unitId: 'unit2' }])
  assert.equal(engine.reviewItems[0].word.senses.length, 2)
  assert.equal(engine.reviewItems[0].origins.length, 2)
  assert.equal(engine.startReview('selected', { kind: 'review', scope: 'selected', words: ['missing'] }), false)
})

test('一轮最多 20 词，未进入本轮的到期任务保留', () => {
  const engine = new GameEngine()
  for (let i = 0; i < 25; i++) engine.addToReview({ ...word, english: `word${i}` })
  engine.startReview('review=1')
  assert.equal(engine.deck.length, 20)
  assert.equal(engine.dueCount, 25)
  engine.checkAnswer(engine.deck[0].english)
  assert.equal(engine.reviewItems[0].schedule?.stage, 1)
  assert.equal(engine.dueCount, 24)
})
