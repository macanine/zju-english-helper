import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCards,
  cleanEnglish,
  extractBlanks,
  hasUsableExamples,
  pickExample,
  type WordEntry,
} from '../lib/model'

const sense = (zh = '', en = '', examples: string[] = [], pos: string | null = null) => ({
  pos,
  zh,
  en,
  examples,
})
const word = (english: string, pos: string | null = 'v.', senses = [sense()]): WordEntry => ({
  english,
  senses: senses.map((s) => ({ ...s, pos: s.pos ?? pos })),
})

test('cleanEnglish 取逗号前的英文', () => {
  assert.equal(cleanEnglish('sprawl, sprawls'), 'sprawl')
  assert.equal(cleanEnglish('  look after '), 'look after')
})

test('buildCards 默认按释义展开（每个释义一道题）', () => {
  const multi: WordEntry = { english: 'sprawl', senses: [sense('（建筑群）杂乱延伸'), sense('摊开手脚躺着')] }
  const cards = buildCards([multi, word('wander')], 'sense')
  assert.deepEqual(
    cards.map((c) => [c.english, c.sense.zh]),
    [
      ['sprawl', '（建筑群）杂乱延伸'],
      ['sprawl', '摊开手脚躺着'],
      ['wander', ''],
    ]
  )
  // 每张卡都带着该词的全部释义，提示与错题本展示都靠它
  assert.deepEqual(cards[0].senses.map((s) => s.zh), ['（建筑群）杂乱延伸', '摊开手脚躺着'])
  assert.equal(cards[2].senses.length, 1)
})

test('buildCards 的 first / all：同词只考一次', () => {
  const multi: WordEntry = { english: 'split', senses: [sense('离婚，分手'), sense('产生分歧，分裂')] }
  for (const mode of ['first', 'all'] as const) {
    const cards = buildCards([multi], mode)
    assert.equal(cards.length, 1)
    assert.equal(cards[0].sense.zh, '离婚，分手') // 题面用第一条释义
    assert.equal(cards[0].senses.length, 2) // 但提示里能拿到全部释义
  }
})

test('没有释义的词条不会进牌组', () => {
  assert.deepEqual(buildCards([{ english: 'empty', senses: [] }], 'sense'), [])
})

test('卡片以单词为单位：同词的多张卡 english 相同（错题本 / 统计按词记）', () => {
  const cards = buildCards([{ english: 'grasp', senses: [sense('理解力'), sense('抓牢')] }], 'sense')
  assert.equal(cards.length, 2)
  assert.equal(cards[0].english, cards[1].english)
})

test('词性跟着释义走：多义词的不同释义各带各的词性', () => {
  const word: WordEntry = {
    english: 'explosive',
    senses: [sense('易爆的', '', [], 'adj.'), sense('炸药', '', [], 'n.')],
  }
  const cards = buildCards([word], 'sense')
  assert.deepEqual(
    cards.map((c) => c.sense.pos),
    ['adj.', 'n.']
  )
})

test('pickExample 随机取一条，空数组返回空串', () => {
  const examples = ['A [[b]].', 'C [[d]].']
  const picked = pickExample(examples)
  assert.ok(examples.includes(picked))
  assert.equal(pickExample([]), '')
})

test('extractBlanks 按出现顺序取 [[..]] 内的词', () => {
  assert.deepEqual(extractBlanks('He would not have [[succeeded]] if he had not been a [[clever]] man.'), [
    'succeeded',
    'clever',
  ])
  assert.deepEqual(extractBlanks('没有标记的例句'), [])
})

test('hasUsableExamples 判断该释义是否存在挖空例句', () => {
  const usable = buildCards([word('a', 'v.', [sense('甲', '', ['An [[a]].'])])], 'sense')[0]
  const unusable = buildCards([word('b', 'v.', [sense('乙')])], 'sense')[0]
  assert.equal(hasUsableExamples(usable), true)
  assert.equal(hasUsableExamples(unusable), false)
})
