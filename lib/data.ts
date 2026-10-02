import { isWordEntry, type WordEntry } from './model'
import { hasFields, isId, isText } from './validation'

export interface BookMeta {
  id: string
  name: string
  units: string[]
}

export interface Manifest {
  books: BookMeta[]
}

function isManifest(value: unknown): value is Manifest {
  if (!hasFields(value, ['books']) || !Array.isArray(value.books) || value.books.length === 0) return false
  const seen = new Set<string>()
  return value.books.every((book: unknown) => {
    if (!hasFields(book, ['id', 'name', 'units']) || !isId(book.id) || !isText(book.name) ||
        !Array.isArray(book.units) || book.units.length === 0 || !book.units.every(isId) ||
        new Set(book.units).size !== book.units.length || seen.has(book.id)) return false
    seen.add(book.id)
    return true
  })
}

let manifestPromise: Promise<Manifest> | null = null

/** 加载词库清单 public/data/index.json；失败不缓存，便于重试 */
export function loadManifest(): Promise<Manifest> {
  manifestPromise ??= fetch('/data/index.json')
    .then(async (res) => {
      if (!res.ok) throw new Error(`词库清单加载失败 (${res.status})`)
      return await res.json() as unknown
    })
    .then((data) => {
      if (!isManifest(data)) throw new Error('词库清单格式错误')
      return data
    })
    .catch((err: unknown) => {
      manifestPromise = null
      throw err
    })
  return manifestPromise
}

const unitCache = new Map<string, Promise<WordEntry[]>>()

async function fetchUnit(bookId: string, unitId: string): Promise<WordEntry[]> {
  const key = `${bookId}/${unitId}`
  const res = await fetch(`/data/${key}.json`)
  if (!res.ok) throw new Error(`词库加载失败：${key} (${res.status})`)
  const words: unknown = await res.json()
  if (!Array.isArray(words) || !words.every(isWordEntry) ||
      new Set(words.map((word) => word.english)).size !== words.length) {
    throw new Error(`词库数据格式错误：${key}`)
  }
  return words
}

function loadUnit(bookId: string, unitId: string): Promise<WordEntry[]> {
  const key = `${bookId}/${unitId}`
  let hit = unitCache.get(key)
  if (!hit) {
    hit = fetchUnit(bookId, unitId).catch((err: unknown) => {
      unitCache.delete(key) // 失败不缓存，便于重试
      throw err
    })
    unitCache.set(key, hit)
  }
  return hit
}

/** 加载一本词书若干单元的全部词条（按单元顺序拼接） */
export async function loadWords(bookId: string, unitIds: string[]): Promise<WordEntry[]> {
  const manifest = await loadManifest()
  const book = manifest.books.find((entry) => entry.id === bookId)
  if (!book || unitIds.length === 0 || new Set(unitIds).size !== unitIds.length ||
      unitIds.some((unit) => !book.units.includes(unit))) {
    throw new Error('所选词书或单元不存在，请重新选择。')
  }
  const perUnit = await Promise.all(unitIds.map((u) => loadUnit(bookId, u)))
  return perUnit.flat()
}

export function unitLabel(unitId: string): string {
  return unitId.replace(/^unit/, '')
}
