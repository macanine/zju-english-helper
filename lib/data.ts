import type { WordEntry } from './model'

export interface BookMeta {
  id: string
  name: string
  units: string[]
}

/** 已知词书的显示名；未收录的词书直接显示目录 id */
const BOOK_NAME_MAP: Record<string, string> = {
  book2: '大英三',
  book3: '大英四',
}

export interface Manifest {
  books: BookMeta[]
}

let manifestPromise: Promise<Manifest> | null = null

/** 加载词库清单 public/data/index.json；失败不缓存，便于重试 */
export function loadManifest(): Promise<Manifest> {
  manifestPromise ??= fetch('/data/index.json')
    .then(async (res) => {
      if (!res.ok) throw new Error(`词库清单加载失败 (${res.status})`)
      return (await res.json()) as { books?: { id?: string; units?: string[] }[] }
    })
    .then((data) => {
      if (!Array.isArray(data.books)) throw new Error('词库清单格式错误')
      return {
        books: data.books
          .filter((b): b is { id: string; units?: string[] } => typeof b.id === 'string')
          .map((b) => ({ id: b.id, name: BOOK_NAME_MAP[b.id] ?? b.id, units: b.units ?? [] })),
      }
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
  if (!Array.isArray(words)) throw new Error(`词库数据格式错误：${key}`)
  return words as WordEntry[]
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
  const perUnit = await Promise.all(unitIds.map((u) => loadUnit(bookId, u)))
  return perUnit.flat()
}

export function unitLabel(unitId: string): string {
  return unitId.replace(/^unit/, '')
}
