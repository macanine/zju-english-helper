import { isWordEntry, type WordEntry } from './model'
import { hasFields, isId, isText } from './validation'
import type { WordOrigin } from './review'

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

export interface LoadProgress {
  loaded: number
  total: number
}

export interface UnitWords {
  unitId: string
  words: WordEntry[]
}

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

async function loadUnitGroups(
  bookId: string,
  unitIds: string[],
  onProgress?: (progress: LoadProgress) => void,
): Promise<UnitWords[]> {
  const manifest = await loadManifest()
  const book = manifest.books.find((entry) => entry.id === bookId)
  if (!book || unitIds.length === 0 || new Set(unitIds).size !== unitIds.length ||
      unitIds.some((unit) => !book.units.includes(unit))) {
    throw new Error('所选词书或单元不存在，请重新选择。')
  }
  const total = unitIds.length
  let loaded = 0
  return Promise.all(
    unitIds.map(async (unitId) => {
      const words = await loadUnit(bookId, unitId)
      loaded += 1
      onProgress?.({ loaded, total })
      return { unitId, words }
    }),
  )
}

/** 按单元顺序建立单词来源索引，供练习和预习共用。 */
export function indexWordOrigins(bookId: string, groups: readonly UnitWords[]): Map<string, WordOrigin[]> {
  const origins = new Map<string, WordOrigin[]>()
  for (const group of groups) {
    for (const word of group.words) {
      let entries = origins.get(word.english)
      if (!entries) {
        entries = []
        origins.set(word.english, entries)
      }
      entries.push({ bookId, unitId: group.unitId })
    }
  }
  return origins
}

/** 加载一本词书若干单元的全部词条（按单元顺序拼接），并报告单元完成进度。 */
export async function loadWordsWithProgress(
  bookId: string,
  unitIds: string[],
  onProgress?: (progress: LoadProgress) => void,
): Promise<WordEntry[]> {
  const groups = await loadUnitGroups(bookId, unitIds, onProgress)
  return groups.flatMap(group => group.words)
}

/** 加载一本词书若干单元的全部词条（按单元顺序拼接） */
export function loadWords(bookId: string, unitIds: string[]): Promise<WordEntry[]> {
  return loadWordsWithProgress(bookId, unitIds)
}

/** 提前填充单元缓存；实际开局仍会校验并报告加载错误。 */
export async function preloadWords(bookId: string, unitIds: string[]): Promise<void> {
  await loadUnitGroups(bookId, unitIds)
}

export async function loadWordsWithOrigins(bookId: string, unitIds: string[], onProgress?: (progress: LoadProgress) => void) {
  const groups = await loadUnitGroups(bookId, unitIds, onProgress)
  return { words: groups.flatMap(group => group.words), origins: indexWordOrigins(bookId, groups) }
}

export function unitLabel(unitId: string): string {
  return unitId.replace(/^unit/, '')
}
