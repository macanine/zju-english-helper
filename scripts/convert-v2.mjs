#!/usr/bin/env node
// 一次性破坏性转换：词库 v1 → v2
// v1: [{ english, chinese, examples }]，chinese 是「英文释义+中文释义」混合文本，多义词条重复出现
// v2: [{ english, pos, senses: [{ zh, en, examples: [] }] }]，同词多义在数据层合并，词性从 pos.json 并入
// 注意：v2 只是中间态，正式数据源是 v3（词性下沉到释义）——跑完本脚本还要再跑 scripts/convert-v3.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data')
const posMap = JSON.parse(readFileSync(join(dataDir, 'pos.json'), 'utf8'))

function splitDef(text) {
  // 中文段的起点 = 第一个汉字 / CJK 标点 / 全角字符（如「（建筑群）…」的全角括号）
  const m = text.match(/[\u4e00-\u9fff\u3000-\u303f\uff01-\uff60]/)
  if (!m) return { zh: '', en: text.trim() }
  const en = text.slice(0, m.index).trim()
  return { zh: text.slice(m.index).trim(), en }
}

function splitExamples(examples) {
  const seen = new Set()
  const out = []
  for (const s of examples.split('；')) {
    const t = s.replace(/^e\.g\.\s*/i, '').trim()
    if (t && !seen.has(t)) {
      seen.add(t)
      out.push(t)
    }
  }
  return out
}

let entryCount = 0
let senseCount = 0
let rescued = 0

for (const book of readdirSync(dataDir)) {
  if (book === 'index.json' || book === 'pos.json') continue
  for (const f of readdirSync(join(dataDir, book))) {
    const arr = JSON.parse(readFileSync(join(dataDir, book, f), 'utf8'))
    entryCount += arr.length
    // 同词多义：按 english 分组，保持首次出现顺序
    const grouped = new Map()
    for (const w of arr) {
      const list = grouped.get(w.english)
      if (list) list.push(w)
      else grouped.set(w.english, [w])
    }
    const out = [...grouped.entries()].map(([english, entries]) => {
      // 词性：查 pos.json，可数性标记（[C]/[U] 等，只用于名词）并入
      const markers = new Set()
      for (const e of entries) {
        for (const m of e.chinese.matchAll(/\[([^\[\]]+)\]/g)) markers.add(m[1].trim())
      }
      let pos = posMap[english] ?? null
      if (pos && markers.size > 0 && pos.includes('n.')) {
        pos = pos.replace('n.', `n. [${[...markers].join(', ')}]`)
      }
      const senses = entries.map((e) => {
        const def = e.chinese
          .replace(/\[[^\[\]]*\]/g, '')
          .replace(/\s{2,}/g, ' ')
          .trim()
          .replace(/^\(?\d{1,2}\)\s*/, '')
        const examples = splitExamples(e.examples)
        let { zh, en } = splitDef(def)
        // 源数据字段错位：真正的释义在 examples 里（chinese 只有 etc. / IPA 等，
        // 如 Maine、cheat death/fate），把含中文的第一条例句搬回释义
        if (!zh && examples.length > 0 && /[\u4e00-\u9fff]/.test(examples[0])) {
          rescued++
          const moved = splitDef(examples[0])
          zh = moved.zh
          en = moved.en || en
          return { zh, en, examples: examples.slice(1) }
        }
        return { zh, en, examples }
      })
      return { english, pos, senses: senses.filter((s) => s.zh || s.en || s.examples.length > 0) }
    })
    senseCount += out.reduce((acc, w) => acc + w.senses.length, 0)
    writeFileSync(join(dataDir, book, f), JSON.stringify(out, null, '\t') + '\n')
  }
}

console.log(`✓ v2 转换完成：${entryCount} 条旧词条 → ${senseCount} 个释义（同词多义已合并）；修正字段错位 ${rescued} 条`)
