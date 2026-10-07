import assert from 'node:assert/strict'
import { test } from 'node:test'

import { DEFAULT_SETTINGS, type SessionOptions } from '../lib/storage'
import {
  decodeResult,
  decodeSession,
  encodeResult,
  encodeSession,
  sessionFromSettings,
  type Session,
} from '../lib/session'

const options = (patch: Partial<SessionOptions> = {}): SessionOptions => ({
  contentFilter: DEFAULT_SETTINGS.contentFilter,
  orderMode: DEFAULT_SETTINGS.orderMode,
  questionMode: DEFAULT_SETTINGS.questionMode,
  mergeMode: DEFAULT_SETTINGS.mergeMode,
  showFirstLetter: DEFAULT_SETTINGS.showFirstLetter,
  ...patch,
})

const practice = (patch: Partial<SessionOptions> = {}): Session => ({
  kind: 'practice',
  bookId: 'book2',
  units: ['unit1-1', 'unit2-1'],
  options: options(patch),
})

test('练习会话 URL 编解码往返一致', () => {
  const session = practice({ orderMode: 'random', questionMode: 'example', showFirstLetter: true })
  assert.deepEqual(decodeSession(encodeSession(session)), session)
})

test('默认选项不写进 URL', () => {
  assert.equal(encodeSession(practice()), 'book=book2&units=unit1-1%2Cunit2-1')
})

test('非默认选项写进 URL', () => {
  const query = encodeSession(practice({ orderMode: 'random', contentFilter: 'phrases_only' }))
  assert.match(query, /order=random/)
  assert.match(query, /filter=phrases_only/)
})

test('复习会话', () => {
  assert.equal(encodeSession({ kind: 'review' }), 'review=1')
  assert.deepEqual(decodeSession('review=1'), { kind: 'review' })
})

test('多义词和听写选项编解码往返一致', () => {
  const session = practice({ mergeMode: 'all', questionMode: 'listen' })
  assert.deepEqual(decodeSession(encodeSession(session)), session)
})

test('缺少词书或单元时解码失败', () => {
  assert.equal(decodeSession(''), null)
  assert.equal(decodeSession('book=book2'), null)
  assert.equal(decodeSession('units=unit1-1'), null)
})

test('非法枚举值不会回退到默认值', () => {
  assert.equal(decodeSession('book=book9&units=unit1-1&order=nope&mode=nope&filter=nope&hint=0'), null)
})

test('sessionFromSettings 拆出词书与选项', () => {
  assert.deepEqual(sessionFromSettings({ ...DEFAULT_SETTINGS, bookId: 'book3', units: ['unit3-1'] }), {
    kind: 'practice',
    bookId: 'book3',
    units: ['unit3-1'],
    options: options(),
  })
})

test('结果页参数编解码往返一致', () => {
  const session = practice({ questionMode: 'example' })
  const stats = { total: 20, firstTryCorrect: 17, durationMs: 95_400 }
  assert.deepEqual(decodeResult(encodeResult(session, stats)), { session, stats })
})

test('结果页参数缺失或非法时解码失败', () => {
  assert.equal(decodeResult('book=book2&units=unit1-1'), null)
  assert.equal(decodeResult('book=book2&units=unit1-1&total=0&first=0&ms=0'), null)
  assert.equal(decodeResult('book=book2&units=unit1-1&total=20&first=x&ms=100'), null)
})
