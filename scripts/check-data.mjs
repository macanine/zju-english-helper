#!/usr/bin/env node
/**
 * 词库体检：npm run check:data
 *
 * public/data 是运行时数据源（结构：{ english, senses: [{ pos, zh, en, examples }] }，
 * 词性跟着释义走），可以直接手改 JSON；零宽空格、NBSP、空词条这类肉眼看不见的脏数据会让
 * 打字判定永远不通过，统一在这里拦下来（应用运行时不再兜底清洗）。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data')
const INVISIBLE = /[\u200b\u00a0]/
const problems = []
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const hasFields = (value, fields) => isObject(value) && Object.keys(value).length === fields.length &&
  fields.every((field) => Object.hasOwn(value, field))
const isId = (value) => typeof value === 'string' && /^[a-zA-Z0-9]+(?:[-_][a-zA-Z0-9]+)*$/.test(value)

const manifest = JSON.parse(readFileSync(join(dataDir, 'index.json'), 'utf8'))
if (!hasFields(manifest, ['books']) || !Array.isArray(manifest.books) || manifest.books.length === 0) {
  console.error('✗ index.json 必须包含非空 books 数组')
  process.exit(1)
}

let unitCount = 0
let wordCount = 0
let senseCount = 0

function checkString(value, where, field, { allowEmpty = false } = {}) {
  if (typeof value !== 'string') {
    problems.push(`${where} 缺少字符串字段 ${field}`)
    return
  }
  if (!allowEmpty && value.trim() === '') {
    problems.push(`${where} ${field} 为空`)
  }
  if (INVISIBLE.test(value)) {
    problems.push(`${where}.${field} 含零宽空格或 NBSP`)
  }
}

const bookIds = new Set()
for (const book of manifest.books) {
  if (!hasFields(book, ['id', 'name', 'units']) || !isId(book.id) ||
      !Array.isArray(book.units) || book.units.length === 0 || !book.units.every(isId)) {
    problems.push('词书必须包含 id、name 和非空 units 数组，id 与单元名只允许字母、数字、连字符和下划线')
    continue
  }
  checkString(book.name, `词书 ${book.id}`, 'name')
  if (bookIds.has(book.id)) problems.push(`词书 id 重复：${book.id}`)
  bookIds.add(book.id)
  if (new Set(book.units).size !== book.units.length) problems.push(`词书 ${book.id} 有重复单元`)
  const dir = join(dataDir, book.id)
  if (!existsSync(dir)) {
    problems.push(`缺少词书目录 ${book.id}/`)
    continue
  }

  for (const unit of book.units) {
    unitCount++
    const file = join(dir, `${unit}.json`)
    if (!existsSync(file)) {
      problems.push(`缺少数据文件 ${book.id}/${unit}.json`)
      continue
    }
    const words = JSON.parse(readFileSync(file, 'utf8'))
    if (!Array.isArray(words)) {
      problems.push(`${book.id}/${unit}.json 不是数组`)
      continue
    }
    const seen = new Set()
    words.forEach((word, i) => {
      const where = `${book.id}/${unit}.json[${i}]`
      if (!hasFields(word, ['english', 'senses'])) {
        problems.push(`${where} 必须只包含 english 与 senses`)
        return
      }
      checkString(word.english, where, 'english')
      if (typeof word.english === 'string' && word.english.trim() !== '') {
        if (word.english !== word.english.trim() || /[,\u0000-\u001f]/.test(word.english)) {
          problems.push(`${where} english 必须是单一词头，不能含逗号、控制字符或首尾空格`)
        }
        if (seen.has(word.english)) {
          problems.push(`${where} english 重复：${word.english}（同词多义应合并进 senses）`)
        }
        seen.add(word.english)
      }
      // 释义
      if (!Array.isArray(word.senses) || word.senses.length === 0) {
        problems.push(`${where} 缺少非空 senses 数组`)
      } else {
        for (const [j, sense] of word.senses.entries()) {
          const sWhere = `${where}.senses[${j}]`
          if (!hasFields(sense, ['pos', 'zh', 'en', 'examples'])) {
            problems.push(`${sWhere} 必须只包含 pos、zh、en 与 examples`)
            continue
          }
          if (sense.pos !== null && (typeof sense.pos !== 'string' || sense.pos.trim() === '')) {
            problems.push(`${sWhere} pos 必须是字符串或 null（词性跟着释义走）`)
          } else if (typeof sense.pos === 'string') {
            if (INVISIBLE.test(sense.pos)) problems.push(`${sWhere}.pos 含零宽空格或 NBSP`)
            if (!/^[A-Za-z\u4e00-\u9fff]/.test(sense.pos)) {
              problems.push(`${sWhere} pos 格式可疑：${sense.pos}`)
            }
          }
          checkString(sense.zh, sWhere, 'zh', { allowEmpty: true })
          checkString(sense.en, sWhere, 'en', { allowEmpty: true })
          if (typeof sense.zh !== 'string' || typeof sense.en !== 'string') continue
          if (sense.zh === '' && sense.en === '') {
            problems.push(`${sWhere} zh 与 en 同时为空`)
          }
          if (!Array.isArray(sense.examples)) {
            problems.push(`${sWhere} 缺少 examples 数组`)
          } else {
            sense.examples.forEach((ex, k) => checkString(ex, `${sWhere}.examples[${k}]`, 'sentence', { allowEmpty: true }))
          }
        }
      }
    })
    wordCount += words.length
    senseCount += words.reduce((acc, w) => acc + (isObject(w) && Array.isArray(w.senses) ? w.senses.length : 0), 0)
  }

  for (const name of readdirSync(dir)) {
    if (name.endsWith('.json') && !book.units.includes(name.replace(/\.json$/, ''))) {
      problems.push(`${book.id}/${name} 未登记在 index.json`)
    }
  }
}

for (const entry of readdirSync(dataDir, { withFileTypes: true })) {
  if (entry.isDirectory() && !bookIds.has(entry.name)) problems.push(`词书目录 ${entry.name}/ 未登记在 index.json`)
}

if (problems.length > 0) {
  console.error(`✗ 词库体检未通过，发现 ${problems.length} 个问题：`)
  for (const p of problems.slice(0, 50)) console.error(`  · ${p}`)
  process.exit(1)
}
console.log(
  `✓ 词库体检通过：${manifest.books.length} 本词书 / ${unitCount} 个单元 / ${wordCount} 个词条 / ${senseCount} 条释义`
)
