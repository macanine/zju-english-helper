import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'

import { buildBackup, importBackup } from '../lib/backup'

/** storage/backup 直接用全局 localStorage，测试里换成内存实现 */
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

test('buildBackup 收集所有 zjueh 数据并跳过损坏项', () => {
  store.set('zjueh.wrong-words', JSON.stringify([{ english: 'apple' }]))
  store.set('zjueh.prefs', JSON.stringify({ rate: 0.9 }))
  store.set('zjueh.day-stats', '{ 坏掉的 JSON')
  store.set('other.key', JSON.stringify({ nope: true }))

  const backup = buildBackup()
  assert.equal(backup.app, 'zjueh')
  assert.equal(backup.version, 1)
  assert.ok(backup.exportedAt)
  assert.deepEqual(Object.keys(backup.data).sort(), ['zjueh.prefs', 'zjueh.wrong-words'])
  assert.deepEqual(backup.data['zjueh.prefs'], { rate: 0.9 })
})

test('importBackup 覆盖写入备份里的键', () => {
  store.set('zjueh.prefs', JSON.stringify({ rate: 0.5 }))
  const text = JSON.stringify({
    app: 'zjueh',
    version: 1,
    data: {
      'zjueh.prefs': { rate: 1.2 },
      'zjueh.mastered': [{ english: 'apple' }],
    },
  })
  const result = importBackup(text)
  assert.deepEqual(result, { ok: true, keys: 2 })
  assert.deepEqual(JSON.parse(store.get('zjueh.prefs')!), { rate: 1.2 })
  assert.deepEqual(JSON.parse(store.get('zjueh.mastered')!), [{ english: 'apple' }])
  // 备份里没有的键保持原样
  assert.equal(store.has('zjueh.wrong-words'), false)
})

test('importBackup 拒绝非法或空的备份', () => {
  assert.deepEqual(importBackup('not json'), { ok: false, error: '文件不是有效的 JSON。' })
  assert.equal(importBackup('{"app":"zjueh"}').ok, false)
  assert.equal(importBackup('{"data":[1,2]}').ok, false)
  const empty = importBackup(JSON.stringify({ data: { 'other.key': 1 } }))
  assert.deepEqual(empty, { ok: false, error: '备份里没有可导入的数据。' })
})

test('导出再导入是一次完整往返', () => {
  store.set('zjueh.wrong-words', JSON.stringify([{ english: 'apple', sense: { zh: '苹果' } }]))
  store.set('zjueh.word-stats', JSON.stringify({ 'apple\u0000苹果': { attempts: 2, wrongs: 1 } }))
  const backup = buildBackup()

  store.clear()
  assert.equal(store.size, 0)
  assert.deepEqual(importBackup(JSON.stringify(backup)), { ok: true, keys: 2 })
  assert.deepEqual(JSON.parse(store.get('zjueh.word-stats')!), {
    'apple\u0000苹果': { attempts: 2, wrongs: 1 },
  })
})
