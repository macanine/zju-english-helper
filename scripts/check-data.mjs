#!/usr/bin/env node
/**
 * 词库体检：npm run check:data
 *
 * public/data 是运行时数据源（v3 结构：{ english, senses: [{ pos, zh, en, examples }] }，
 * 词性跟着释义走），可以直接手改 JSON；零宽空格、NBSP、空词条这类肉眼看不见的脏数据会让
 * 打字判定永远不通过，统一在这里拦下来（应用运行时不再兜底清洗）。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data')
const INVISIBLE = /[\u200b\u00a0]/
const problems = []

const manifest = JSON.parse(readFileSync(join(dataDir, 'index.json'), 'utf8'))
if (!Array.isArray(manifest.books) || manifest.books.length === 0) {
  problems.push('index.json 里没有 books')
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

for (const book of manifest.books ?? []) {
  const dir = join(dataDir, book.id)
  if (!existsSync(dir)) {
    problems.push(`缺少词书目录 ${book.id}/`)
    continue
  }

  for (const unit of book.units ?? []) {
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
      checkString(word.english, where, 'english')
      if (typeof word.english === 'string' && word.english.trim() !== '') {
        if (seen.has(word.english)) {
          problems.push(`${where} english 重复：${word.english}（同词多义应合并进 senses）`)
        }
        seen.add(word.english)
      }
      // v3 起词性挂在释义上，词条级 pos 已废弃
      if ('pos' in word) {
        problems.push(`${where} 仍有词条级 pos（v3 词性在 senses[].pos 上，转换脚本：node scripts/convert-v3.mjs）`)
      }
      // 释义
      if (!Array.isArray(word.senses) || word.senses.length === 0) {
        problems.push(`${where} 缺少非空 senses 数组`)
      } else {
        for (const [j, sense] of word.senses.entries()) {
          const sWhere = `${where}.senses[${j}]`
          if (!sense || typeof sense !== 'object') {
            problems.push(`${sWhere} 不是对象`)
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
    senseCount += words.reduce((acc, w) => acc + (Array.isArray(w.senses) ? w.senses.length : 0), 0)
  }

  for (const name of readdirSync(dir)) {
    if (name.endsWith('.json') && !(book.units ?? []).includes(name.replace(/\.json$/, ''))) {
      problems.push(`${book.id}/${name} 未登记在 index.json`)
    }
  }
}

if (problems.length > 0) {
  console.error(`✗ 词库体检未通过，发现 ${problems.length} 个问题：`)
  for (const p of problems.slice(0, 50)) console.error(`  · ${p}`)
  process.exit(1)
}
console.log(
  `✓ 词库体检通过：${manifest.books.length} 本词书 / ${unitCount} 个单元 / ${wordCount} 个词条 / ${senseCount} 条释义`
)
