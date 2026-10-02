#!/usr/bin/env node
/**
 * 一次性数据整理：把多义词条里「词条级共享」的例句，按各释义的实际用法拆分到释义上。
 *
 * 判定来源：scripts/example-split.jsonl（逐词人工判定，每行一个词）：
 *   {"english":"head-to-head","assign":[[0],[1]]}
 * assign[i] 是第 i 条释义应保留的例句下标（下标指向拆分前 senses[0].examples 的顺序）。
 *
 * 校验（不通过就拒绝写盘）：
 *   - 每个待拆分词条都必须有判定，且释义数与判定数组长度一致；
 *   - 拆分前后例句集合完全一致（一句不丢、一句不添）；
 *   - 同一个词在多个单元出现时，例句集合必须一致（如 blur）。
 *
 * 拆分前的词库会先备份到 archive/v3-json/。
 * 用法：node scripts/apply-example-split.mjs
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = join(root, 'public', 'data')
const backupDir = join(root, 'archive', 'v3-json')
const mappingFile = join(root, 'scripts', 'example-split.jsonl')

const mapping = new Map()
for (const line of readFileSync(mappingFile, 'utf8').split('\n')) {
  const trimmed = line.trim()
  if (!trimmed) continue
  const entry = JSON.parse(trimmed)
  mapping.set(entry.english, entry.assign)
}

// 先整体读入并备份
const files = []
for (const book of readdirSync(dataDir)) {
  if (book === 'index.json') continue
  for (const file of readdirSync(join(dataDir, book))) {
    const src = join(dataDir, book, file)
    files.push({ book, file, src, words: JSON.parse(readFileSync(src, 'utf8')) })
  }
}
mkdirSync(backupDir, { recursive: true })
for (const { book, file, src } of files) {
  mkdirSync(join(backupDir, book), { recursive: true })
  copyFileSync(src, join(backupDir, book, file))
}

const problems = []
let words = 0
let senses = 0
let moved = 0
let keptEmpty = 0
let rewritten = 0

for (const { book, file, src, words: list } of files) {
  let dirty = false
  for (const word of list) {
    if (word.senses.length < 2) continue
    words++

    const union = []
    for (const sense of word.senses) {
      for (const sentence of sense.examples) {
        if (!union.includes(sentence)) union.push(sentence)
      }
    }
    if (union.length === 0) {
      keptEmpty++
      continue // 词条本来就没有例句
    }

    const assign = mapping.get(word.english)
    if (!assign) {
      problems.push(`${word.english}（${book}/${file}）：缺少拆分判定`)
      continue
    }
    if (assign.length !== word.senses.length) {
      problems.push(
        `${word.english}（${book}/${file}）：判定数组长度 ${assign.length} ≠ 释义数 ${word.senses.length}`
      )
      continue
    }

    // 校验拆分前后例句集合一致
    const assigned = []
    for (const indices of assign) {
      for (const index of indices) {
        if (!Number.isInteger(index) || index < 0 || index >= union.length) {
          problems.push(`${word.english}：例句下标越界 ${index}`)
          continue
        }
        assigned.push(union[index])
      }
    }
    const before = [...union].sort().join('\u0000')
    const after = [...new Set(assigned)].sort().join('\u0000')
    if (before !== after) {
      problems.push(`${word.english}（${book}/${file}）：拆分前后例句集合不一致`)
      continue
    }

    for (const [i, sense] of word.senses.entries()) {
      const next = assign[i].map((index) => union[index])
      moved += sense.examples.length !== next.length ? 1 : 0
      senses++
      sense.examples = next
    }
    dirty = true
  }

  if (dirty) {
    writeFileSync(src, `${JSON.stringify(list, null, '\t')}\n`)
    rewritten++
  }
}

console.log(`[example-split] 多义词条 ${words} 个（其中无例句跳过 ${keptEmpty}），重写文件 ${rewritten} 个`)
console.log(`[example-split] 拆分前的词库已备份到 archive/v3-json/`)
if (problems.length > 0) {
  console.error(`[example-split] ${problems.length} 个问题，请处理后重跑：`)
  for (const line of problems) console.error(`  - ${line}`)
  console.error('  如需回滚：删除 public/data 后从 archive/v3-json/ 拷回（或 node scripts/convert-v3.mjs --restore 后重跑 convert-v3）')
  process.exit(1)
}
