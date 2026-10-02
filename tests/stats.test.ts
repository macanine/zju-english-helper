import assert from 'node:assert/strict'
import { test } from 'node:test'

import { EMPTY_DAY, dayKey, recentDays, recordAnswer, shiftDay, streakDays, summarizeDay } from '../lib/stats'

test('dayKey 按本地时区生成 YYYY-MM-DD', () => {
  assert.equal(dayKey(new Date(2026, 0, 5)), '2026-01-05')
  assert.equal(dayKey(new Date(2026, 11, 31)), '2026-12-31')
})

test('shiftDay 跨月跨年正确', () => {
  assert.equal(shiftDay('2026-03-01', -1), '2026-02-28')
  assert.equal(shiftDay('2026-01-01', -1), '2025-12-31')
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01')
  assert.equal(shiftDay('2026-02-28', 1), '2026-03-01')
})

test('recordAnswer 累加词数 / 正确数与用时', () => {
  let days = recordAnswer({}, '2026-05-01', true, 4000)
  days = recordAnswer(days, '2026-05-01', false, 6000)
  days = recordAnswer(days, '2026-05-01', true, -100)
  assert.deepEqual(days['2026-05-01'], { words: 3, correct: 2, ms: 10000 })
  // 不改动传入对象
  const before = { '2026-05-01': { words: 1, correct: 1, ms: 1 } }
  const after = recordAnswer(before, '2026-05-01', true, 1)
  assert.equal(before['2026-05-01'].words, 1)
  assert.equal(after['2026-05-01'].words, 2)
})

test('streakDays 连续天数：今天没练则从昨天算起', () => {
  const days = {
    '2026-05-01': { words: 3, correct: 3, ms: 1000 },
    '2026-05-02': { words: 1, correct: 0, ms: 1000 },
    '2026-05-03': { words: 5, correct: 5, ms: 1000 },
  }
  assert.equal(streakDays(days, '2026-05-03'), 3)
  assert.equal(streakDays(days, '2026-05-04'), 3) // 今天还没练，连续记录保留
  assert.equal(streakDays(days, '2026-05-05'), 0) // 隔了两天，断了
  assert.equal(streakDays({}, '2026-05-03'), 0)
  // 中间断档只数到断点
  const gapped = { '2026-05-01': { words: 1, correct: 1, ms: 1 }, '2026-05-03': { words: 1, correct: 1, ms: 1 } }
  assert.equal(streakDays(gapped, '2026-05-03'), 1)
})

test('recentDays 返回含今天的最近 n 天并补空', () => {
  const days = { '2026-05-03': { words: 4, correct: 4, ms: 1000 } }
  const recent = recentDays(days, '2026-05-03', 3)
  assert.deepEqual(
    recent.map((d) => d.key),
    ['2026-05-01', '2026-05-02', '2026-05-03']
  )
  assert.deepEqual(recent[0].stat, EMPTY_DAY)
  assert.equal(recent[2].stat.words, 4)
})

test('summarizeDay 计算正确率与用时文案', () => {
  assert.deepEqual(summarizeDay({ words: 0, correct: 0, ms: 0 }), {
    words: 0,
    accuracy: null,
    durationText: '0 秒',
  })
  const s = summarizeDay({ words: 4, correct: 3, ms: 95_000 })
  assert.equal(s.accuracy, 75)
  assert.equal(s.durationText, '1 分 35 秒')
})
