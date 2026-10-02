import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'

import { GameEngine, orderForReview } from '../lib/engine'
import { buildCards, type WordEntry } from '../lib/model'
import { dayKey } from '../lib/stats'
import { loadDayStats, loadMastered, loadWordStats, loadWrongWords, type SessionOptions } from '../lib/storage'

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

const appleWord: WordEntry = {
  english: 'apple',
  senses: [{ pos: 'n. [C]', zh: '苹果', en: 'a round fruit with red or green skin', examples: ['I ate an [[apple]].'] }],
}
const bananaWord: WordEntry = {
  english: 'banana',
  senses: [{ pos: 'n. [C]', zh: '香蕉', en: '', examples: [] }],
}
const phraseWord: WordEntry = {
  english: 'look after',
  senses: [{ pos: '短语', zh: '照顾', en: 'to take care of', examples: ['She [[looks after]] her sister.'] }],
}
const wordlessWord: WordEntry = {
  english: 'wormhole',
  senses: [{ pos: 'n. [C]', zh: '虫洞', en: '', examples: [] }],
}

const [apple, phrase, banana] = buildCards([appleWord, phraseWord, bananaWord], 'sense')
const wordless = buildCards([wordlessWord], 'sense')[0]
const words = [apple, phrase, banana]

const options = (patch: Partial<SessionOptions> = {}): SessionOptions => ({
  contentFilter: 'all',
  orderMode: 'sequential',
  questionMode: 'word',
  mergeMode: 'sense',
  showFirstLetter: false,
  ...patch,
})

beforeEach(() => store.clear())

test('startSession 按内容过滤并保持顺序', () => {
  const engine = new GameEngine()
  engine.startSession(words, options(), 'k')
  assert.deepEqual(
    engine.deck.map((w) => w.english),
    ['apple', 'look after', 'banana']
  )

  engine.startSession(words, options({ contentFilter: 'words_only' }), 'k')
  assert.deepEqual(
    engine.deck.map((w) => w.english),
    ['apple', 'banana']
  )

  engine.startSession(words, options({ contentFilter: 'phrases_only' }), 'k')
  assert.deepEqual(
    engine.deck.map((w) => w.english),
    ['look after']
  )
})

test('startSession 返回牌组词数，过滤后为空时返回 0', () => {
  const engine = new GameEngine()
  assert.equal(engine.startSession(words, options({ contentFilter: 'phrases_only' }), 'k'), 1)
  assert.equal(engine.startSession([apple, banana], options({ contentFilter: 'phrases_only' }), 'k'), 0)
})

test('随机模式打乱顺序但不丢词条', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({
    english: `word${i}`,
    sense: { pos: null, zh: '', en: '', examples: [] },
    senses: [{ pos: null, zh: '', en: '', examples: [] }],
  }))
  const engine = new GameEngine()
  engine.startSession(many, options({ orderMode: 'random' }), 'k')
  assert.deepEqual(
    [...engine.deck.map((w) => w.english)].sort(),
    many.map((w) => w.english).sort()
  )
})

test('checkAnswer 忽略大小写与首尾空白，答对推进索引', () => {
  const engine = new GameEngine()
  engine.startSession(words, options(), 'k')
  assert.equal(engine.checkAnswer(' Apple '), true)
  assert.equal(engine.index, 1)
  assert.equal(engine.wrongCount, 0)
  assert.equal(engine.stats().firstTryCorrect, 1)
})

test('答错记入错题本并持久化', () => {
  const engine = new GameEngine()
  engine.startSession(words, options(), 'k')
  assert.equal(engine.checkAnswer('appel'), false)
  assert.equal(engine.wrongCount, 1)
  assert.equal(engine.stats().firstTryCorrect, 0)
  assert.deepEqual(loadWrongWords(), [apple])
  // 新实例（模拟刷新页面）能读回错题本
  assert.equal(new GameEngine().wrongCount, 1)
})

test('打字过程出错（markWrong）即使最终答对也进错题本', () => {
  const engine = new GameEngine()
  engine.startSession(words, options(), 'k')
  assert.equal(engine.checkAnswer('apple', { markWrong: true }), true)
  assert.equal(engine.wrongCount, 1)
  assert.equal(engine.stats().firstTryCorrect, 0)
})

test('例句模式按句中变形词判分', () => {
  const engine = new GameEngine()
  engine.startSession([phrase], options({ questionMode: 'example' }), 'k')
  assert.equal(engine.checkAnswer('looks after', { expected: 'looks after' }), true)
  assert.equal(engine.wrongCount, 0)
})

test('skipWithoutPenalty 把已在错题本的词移除', () => {
  const engine = new GameEngine()
  engine.startSession([apple], options(), 'k')
  engine.checkAnswer('appel')
  assert.equal(engine.wrongCount, 1)

  const resumed = new GameEngine()
  resumed.startSession([apple], options(), 'k')
  assert.deepEqual(resumed.skipWithoutPenalty(), apple)
  assert.equal(resumed.wrongCount, 0)
  assert.equal(resumed.stats().firstTryCorrect, 0)
  assert.deepEqual(loadWrongWords(), [])
})

test('startReview 清空错题本并强制单词模式 + 首字母提示', () => {
  const engine = new GameEngine()
  engine.startSession(words, options({ questionMode: 'example' }), 'k')
  engine.checkAnswer('x')
  engine.checkAnswer('x')
  assert.equal(engine.wrongCount, 2)

  assert.equal(engine.startReview('review=1'), true)
  assert.equal(engine.wrongCount, 0)
  assert.equal(engine.deck.length, 2)
  assert.equal(engine.questionMode, 'word')
  assert.equal(engine.showFirstLetter, true)
  assert.equal(engine.startReview('review=1'), false) // 空错题本无法复习
})

test('isActive 只在同一会话且还有未答题时成立', () => {
  const engine = new GameEngine()
  engine.startSession([apple, banana], options(), 'k')
  assert.equal(engine.isActive('k'), true)
  assert.equal(engine.isActive('other'), false)
  engine.checkAnswer('apple')
  engine.checkAnswer('banana')
  assert.equal(engine.isActive('k'), false)
})

test('nextQuestion 在例句模式跳过没有 [[..]] 标记的词条', () => {
  const engine = new GameEngine()
  engine.startSession([wordless, banana, apple], options({ questionMode: 'example' }), 'k')
  const next = engine.nextQuestion()
  assert.ok(next.kind === 'question')
  assert.equal(next.word.english, 'apple')
  assert.deepEqual(engine.progress(), [2, 3])
})

test('整副牌都没有可用例句时返回 no-examples', () => {
  const engine = new GameEngine()
  engine.startSession([wordless, banana], options({ questionMode: 'example' }), 'k')
  assert.equal(engine.nextQuestion().kind, 'no-examples')
})

test('答完返回 done，统计与牌组一致', () => {
  const engine = new GameEngine()
  engine.startSession([apple, banana], options(), 'k')
  engine.nextQuestion()
  engine.checkAnswer('apple')
  engine.checkAnswer('nope')
  assert.equal(engine.nextQuestion().kind, 'done')
  const stats = engine.stats()
  assert.equal(stats.total, 2)
  assert.equal(stats.firstTryCorrect, 1)
  assert.ok(stats.durationMs >= 0)
})

test('错题本支持逐条移除与清空', () => {
  const engine = new GameEngine()
  engine.startSession(words, options(), 'k')
  engine.checkAnswer('x')
  engine.checkAnswer('x')
  assert.equal(engine.wrongCount, 2)

  engine.removeWrongWord(apple)
  assert.deepEqual(
    engine.wrongWords.map((w) => w.english),
    ['look after']
  )

  engine.clearWrongWords()
  assert.equal(engine.wrongCount, 0)
  assert.deepEqual(loadWrongWords(), [])
})

test('checkAnswer 记录单词级与当日练习记录', () => {
  const engine = new GameEngine()
  engine.startSession([apple, banana], options(), 'k')
  engine.checkAnswer('apple') // 首次答对
  engine.checkAnswer('x', { markWrong: true }) // 打字过程中出错

  const stats = engine.allWordStats()
  const appleKey = apple.english
  const bananaKey = banana.english
  assert.equal(stats[appleKey].attempts, 1)
  assert.equal(stats[appleKey].wrongs, 0)
  assert.ok(stats[appleKey].lastSeen > 0)
  assert.equal(stats[appleKey].lastWrong, 0)
  assert.equal(stats[bananaKey].attempts, 1)
  assert.equal(stats[bananaKey].wrongs, 1)
  assert.ok(stats[bananaKey].lastWrong > 0)

  // 持久化：新实例（模拟刷新）能读回
  assert.deepEqual(loadWordStats(), stats)

  const today = loadDayStats()[dayKey()]
  assert.equal(today.words, 2)
  assert.equal(today.correct, 1)
  assert.ok(today.ms >= 0)
})

test('skipWithoutPenalty 不计入单词统计', () => {
  const engine = new GameEngine()
  engine.startSession([apple], options(), 'k')
  engine.skipWithoutPenalty()
  assert.deepEqual(engine.allWordStats(), {})
})

test('已掌握的词不进练习与复习，可取消掌握', () => {
  const engine = new GameEngine()
  engine.startSession([apple], options(), 'k')
  engine.checkAnswer('x')
  assert.equal(engine.wrongCount, 1)

  engine.masterWord(apple)
  assert.equal(engine.isMastered(apple), true)
  assert.equal(engine.wrongCount, 0) // 标记掌握时移出错题本
  assert.deepEqual(loadMastered(), [apple])

  // 练习与复习都不再收到已掌握的词
  assert.equal(engine.startSession([apple, banana], options(), 'k'), 1)
  assert.deepEqual(
    engine.deck.map((w) => w.english),
    ['banana']
  )
  engine.checkAnswer('x') // banana 进错题本
  const review = new GameEngine()
  assert.equal(review.startReview('review=1'), true)
  assert.deepEqual(
    review.deck.map((w) => w.english),
    ['banana']
  )

  engine.unmasterWord(apple)
  assert.equal(engine.isMastered(apple), false)
  assert.deepEqual(loadMastered(), [])
  // 取消掌握后放回错题本（banana 之前也答错进了错题本）
  assert.equal(engine.wrongCount, 2)
  assert.ok(engine.wrongWords.some((w) => w.english === 'apple'))
  assert.equal(engine.startSession([apple], options(), 'k'), 1)
})

test('startReview 按错误次数从多到少排队', () => {
  const engine = new GameEngine()
  engine.startSession(words, options(), 'k')
  engine.checkAnswer('x') // apple 错 1 次
  engine.checkAnswer('x') // look after 错 1 次
  engine.checkAnswer('x') // banana 错 1 次
  for (let i = 0; i < 2; i++) {
    const again = new GameEngine()
    again.startSession([apple], options(), 'k')
    again.checkAnswer('x') // apple 累计错 3 次
  }

  const review = new GameEngine()
  assert.equal(review.startReview('review=1'), true)
  assert.equal(review.deck[0].english, 'apple') // 错得最多排最前
  assert.equal(review.deck.length, 3)
})

test('orderForReview 错误次数相同则久未答错的优先', () => {
  const stats = {
    apple: { attempts: 2, wrongs: 1, lastSeen: 100, lastWrong: 100 },
    banana: { attempts: 2, wrongs: 1, lastSeen: 200, lastWrong: 200 },
  }
  assert.deepEqual(
    orderForReview([banana, apple], stats).map((w) => w.english),
    ['apple', 'banana']
  )
  // 没有记录时保持原来的顺序
  assert.deepEqual(
    orderForReview([banana, apple], {}).map((w) => w.english),
    ['banana', 'apple']
  )
})
