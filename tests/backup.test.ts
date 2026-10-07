import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'

import { buildBackup, importBackup } from '../lib/backup'
import { DEFAULT_PREFS } from '../lib/storage'
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

test('buildBackup 只收集当前 schema 的数据', () => {
  store.set('zjueh.prefs', JSON.stringify(DEFAULT_PREFS))
  store.set('zjueh.wrong-words', JSON.stringify([card]))
  const backup = buildBackup()
  assert.equal(backup.app, 'zjueh')
  assert.equal(backup.version, 2)
  assert.ok(backup.exportedAt)
  assert.deepEqual(Object.keys(backup.data).sort(), ['zjueh.prefs', 'zjueh.wrong-words'])
})

test('importBackup 覆盖写入当前版本备份', () => {
  const text = JSON.stringify({
    app: 'zjueh',
    version: 2,
    exportedAt: new Date().toISOString(),
    data: {
      'zjueh.prefs': DEFAULT_PREFS,
      'zjueh.wrong-words': [card],
    },
  })
  assert.deepEqual(importBackup(text), { ok: true, keys: 2 })
  assert.deepEqual(JSON.parse(store.get('zjueh.prefs')!), DEFAULT_PREFS)
  assert.deepEqual(JSON.parse(store.get('zjueh.wrong-words')!), [card])
})

test('importBackup 拒绝旧版本、非法和空备份', () => {
  assert.deepEqual(importBackup('not json'), { ok: false, error: '文件不是有效的 JSON。' })
  assert.equal(importBackup(JSON.stringify({
    app: 'zjueh',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {},
  })).ok, false)
  assert.equal(importBackup(JSON.stringify({
    app: 'zjueh',
    version: 2,
    exportedAt: new Date().toISOString(),
    data: { 'other.key': true },
  })).ok, false)
})

test('导出再导入保持当前 schema 不变', () => {
  store.set('zjueh.prefs', JSON.stringify(DEFAULT_PREFS))
  store.set('zjueh.wrong-words', JSON.stringify([card]))
  const backup = buildBackup()
  store.clear()
  assert.deepEqual(importBackup(JSON.stringify(backup)), { ok: true, keys: 2 })
  assert.deepEqual(JSON.parse(store.get('zjueh.prefs')!), DEFAULT_PREFS)
  assert.deepEqual(JSON.parse(store.get('zjueh.wrong-words')!), [card])
})
