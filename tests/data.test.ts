import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadWordsWithOrigins, loadWordsWithProgress, preloadWords, type LoadProgress } from '../lib/data'
import type { WordEntry } from '../lib/model'

function word(english: string): WordEntry {
  return { english, senses: [{ pos: 'n.', zh: '释义', en: '', examples: [] }] }
}

test('预加载与开局共享单元请求，保持顺序和来源，失败后可重试', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })

  const counts = new Map<string, number>()
  const pending = new Map<string, (response: Response) => void>()
  let bothRequested!: () => void
  const requestsStarted = new Promise<void>((resolve) => { bothRequested = resolve })
  const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 })

  globalThis.fetch = (async (input: string | URL | Request) => {
    const path = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    counts.set(path, (counts.get(path) ?? 0) + 1)
    if (path === '/data/index.json') {
      return json({ books: [{ id: 'bookx', name: '测试词书', units: ['unit1', 'unit2', 'unit3', 'unit4'] }] })
    }
    if (path.endsWith('/unit3.json')) {
      return counts.get(path) === 1 ? new Response('', { status: 503 }) : json([word('retry')])
    }
    if (path.endsWith('/unit4.json')) {
      return counts.get(path) === 1 ? json([{ english: 'broken' }]) : json([word('repaired')])
    }
    return new Promise<Response>((resolve) => {
      pending.set(path, resolve)
      if (pending.size === 2) bothRequested()
    })
  }) as typeof fetch

  const warming = preloadWords('bookx', ['unit1', 'unit2'])
  await requestsStarted
  const progress: LoadProgress[] = []
  const starting = loadWordsWithOrigins('bookx', ['unit1', 'unit2'], (value) => progress.push(value))
  pending.get('/data/bookx/unit2.json')!(json([word('shared'), word('second')]))
  pending.get('/data/bookx/unit1.json')!(json([word('first'), word('shared')]))

  const [, result] = await Promise.all([warming, starting])
  assert.deepEqual(result.words.map((item) => item.english), ['first', 'shared', 'shared', 'second'])
  assert.deepEqual(result.origins.get('shared'), [
    { bookId: 'bookx', unitId: 'unit1' },
    { bookId: 'bookx', unitId: 'unit2' },
  ])
  assert.deepEqual(progress, [{ loaded: 1, total: 2 }, { loaded: 2, total: 2 }])
  assert.equal(counts.get('/data/bookx/unit1.json'), 1)
  assert.equal(counts.get('/data/bookx/unit2.json'), 1)
  const reversed = await loadWordsWithProgress('bookx', ['unit2', 'unit1'])
  assert.deepEqual(reversed.map((item) => item.english), ['shared', 'second', 'first', 'shared'])

  await assert.rejects(preloadWords('bookx', ['unit3']), /词库加载失败/)
  const retried = await loadWordsWithOrigins('bookx', ['unit3'])
  assert.equal(retried.words[0].english, 'retry')
  assert.equal(counts.get('/data/bookx/unit3.json'), 2)
  await assert.rejects(preloadWords('bookx', ['unit4']), /词库数据格式错误/)
  assert.equal((await loadWordsWithOrigins('bookx', ['unit4'])).words[0].english, 'repaired')
  assert.equal(counts.get('/data/bookx/unit4.json'), 2)
  await assert.rejects(preloadWords('bookx', ['unit1', 'unit1']), /所选词书或单元不存在/)
})
