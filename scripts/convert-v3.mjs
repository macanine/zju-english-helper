#!/usr/bin/env node
/**
 * 一次性破坏性转换：词库 v2 → v3
 *
 *   v2: [{ english, pos, senses: [{ zh, en, examples }] }]   —— 词性挂在词条上
 *   v3: [{ english, senses: [{ pos, zh, en, examples }] }]   —— 词性跟着释义走
 *
 * 拆分规则（按优先级）：
 *   1. 只有一条释义：原词性原样搬进这条释义（「n. [C] / v.」这类复合词性保留）。
 *   2. 多条释义 + 词性只有一段：每条释义都用它。
 *   3. 多条释义 + 复合词性：查下面的 PER_SENSE 对照表（逐条按该释义的英文定义人工判定，
 *      覆盖全部 90 条）；对照表里没有的按声明顺序一一对应，兜底保留复合词性并打警告。
 *
 * 顺带修数据：词性里的可数性标记去重（如「n. [C, C, usu. sing.]」→「n. [C, usu. sing.]」）。
 *
 * 原文件会先备份到 archive/v2-json/（本目录按约定只放归档、不被构建读取）。
 * 脚本只做 v2 → v3 单向转换：检测到已转换过的数据会直接拒绝运行；
 * 需要回滚时跑 `node scripts/convert-v3.mjs --restore`（从 archive/v2-json/ 拷回 public/data）。
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = join(root, 'public', 'data')
const backupDir = join(root, 'archive', 'v2-json')

function unitFiles() {
  const files = []
  for (const book of readdirSync(dataDir)) {
    if (book === 'index.json') continue
    for (const file of readdirSync(join(dataDir, book))) {
      files.push({ book, file, src: join(dataDir, book, file), backup: join(backupDir, book, file) })
    }
  }
  return files
}

/** 从 archive/v2-json/ 把 v2 原文拷回 public/data */
function restore() {
  let n = 0
  for (const { src, backup } of unitFiles()) {
    copyFileSync(backup, src)
    n++
  }
  console.log(`[convert-v3] 已从 archive/v2-json/ 恢复 v2 词库 ${n} 个文件`)
}

if (process.argv.includes('--restore')) {
  restore()
  process.exit(0)
}

/**
 * 多义 + 复合词性的人工对照表（89 个词头 / 90 条词条，blur 在两个单元各出现一次）。
 * 每条释义取哪段词性，依据的是该释义的英文定义：
 * 定义是动词用法 → v.；是「a/an/the + 名词 / sb. / sth.」→ n.；「(only before noun)」→ adj.；
 * 定义本身不分词性（如 aboard 的 on or onto a ship）→ 保留原来的复合词性。
 * 判定后不再出现的词性段（原词条声明过、但现有释义里没有对应用法）会在末尾列出来。
 */
const PER_SENSE = {
  clone: ['v.', 'v.'],
  drone: ['n. [C]', 'v.'],
  reign: ['v.', 'v.'],
  overnight: ['adv.', 'adv.'],
  'head-to-head': ['adv.', 'adj.'],
  remark: ['v.', 'n.'],
  attribute: ['v.', 'v.'],
  savvy: ['adj.', 'n. [U]'],
  forecast: ['v.', 'n. [C]'],
  grasp: ['n. [sing.]', 'v.'],
  queue: ['v.', 'n. [C]'],
  scramble: ['v.', 'v.'],
  aboard: ['adv. / prep.', 'adv. / prep.'],
  sniff: ['v.', 'v.'],
  puzzle: ['v.', 'n. [C]'],
  charm: ['v.', 'n. [C, U]'],
  sketch: ['v.', 'n. [C]'],
  echo: ['v.', 'n. [C]'],
  layer: ['v.', 'n.'],
  tap: ['v.', 'n. [C]'],
  drip: ['v.', 'v.'],
  parallel: ['adj.', 'adj.'],
  alongside: ['prep.', 'prep.'],
  bump: ['n. [C]', 'v.'],
  sideline: ['n. [pl., C]', 'n. [C]'],
  curve: ['n.', 'n.'],
  hurdle: ['n.', 'n.'],
  split: ['n. [C]', 'v.'],
  hike: ['v.', 'n. [C]'],
  stem: ['v.', 'n. [C]'],
  disguise: ['v.', 'v.'],
  interior: ['adj.', 'n. [C, usu. sing.]'],
  ease: ['v.', 'n. [U]'],
  narrative: ['n. [U, C]', 'n. [U, C]'],
  trace: ['v.', 'v.'],
  blur: ['v.', 'v.'],
  mainstream: ['adj.', 'n. [sing.]'],
  dislike: ['n. [pl.]', 'v.'],
  toast: ['v.', 'n. [U]'],
  leftover: ['n. [pl.]', 'adj.'],
  scrap: ['n. [pl., C]', 'n. [C]'],
  classic: ['adj.', 'adj.'],
  peel: ['n. [C, U]', 'v.'],
  grant: ['v.', 'v.'],
  grave: ['adj.', 'n. [C]'],
  trail: ['n. [C]', 'v.'],
  collapse: ['v.', 'v.'],
  intimate: ['adj.', 'adj.'],
  blanket: ['n. [sing., C]', 'n. [C]'],
  spray: ['v.', 'v.'],
  spawn: ['v.', 'v.'],
  breed: ['n. [C]', 'v.'],
  output: ['n.', 'n.'],
  mate: ['n. [C]', 'n. [C]'],
  slave: ['n.', 'n.'],
  remedy: ['v.', 'n. [C]'],
  final: ['n.', 'n.'],
  groan: ['n. [C]', 'n. [C]'],
  liberal: ['adj.', 'adj.'],
  intern: ['v.', 'n. [C]', 'n. [C]'],
  merit: ['n.', 'n.'],
  spill: ['v.', 'v.'],
  manual: ['n. [C]', 'adj.'],
  imprint: ['n.', 'n.'],
  alien: ['adj.', 'adj.'],
  pose: ['n. [C]', 'v.'],
  tick: ['v.', 'v.'],
  orbit: ['v.', 'n. [C]'],
  flare: ['n. [C, usu. sing.]', 'n. [C, usu. sing.]'],
  strip: ['v.', 'n.'],
  shield: ['v.', 'n. [C]'],
  decay: ['n.', 'n.'],
  epic: ['adj.', 'adj.'],
  shade: ['n. [C, U]', 'n. [C, U]'],
  fell: ['v.', 'v.'],
  Buddhist: ['adj.', 'n. [C]'],
  drift: ['v.', 'v.'],
  catalogue: ['v.', 'n. [C]'],
  trap: ['n.', 'n.'],
  prompt: ['n. [C]', 'v.'],
  command: ['n.', 'n.'],
  surge: ['v.', 'v.'],
  savage: ['adj.', 'adj.'],
  vintage: ['adj.', 'adj.'],
  haunt: ['v.', 'v.'],
  sob: ['n. [C]', 'v.'],
  triumph: ['n. [U, C]', 'n. [U, C]'],
  craft: ['n. [U, C]', 'n. [U, C]'],
  inward: ['adj.', 'adv.'],
}

/** 词性按「/」拆段；顺带去掉段内的重复标记（"n. [C, C]" → "n. [C]"） */
function splitPos(pos) {
  if (!pos) return []
  return pos
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) =>
      part.replace(/\[([^\]]*)\]/, (_, inner) => {
        const seen = []
        for (const m of inner.split(',').map((x) => x.trim()).filter(Boolean)) {
          if (!seen.includes(m)) seen.push(m)
        }
        return `[${seen.join(', ')}]`
      })
    )
}

const warnings = []
const dropped = []
const fixedMarkers = []
let entries = 0
let senses = 0
let tableHits = 0

// 先整体读入并判断结构：本脚本只接受 v2。
// 已经转换过的数据再跑一次会把每条释义的 pos 洗成 null，所以这里直接拒绝。
const units = unitFiles().map((u) => ({ ...u, words: JSON.parse(readFileSync(u.src, 'utf8')) }))
const alreadyV3 = units.filter((u) =>
  u.words.some((w) => !('pos' in w) && w.senses?.some((s) => 'pos' in s))
)
if (alreadyV3.length > 0) {
  console.error('[convert-v3] public/data 已经是 v3 结构，拒绝重复转换（会清空释义词性）：')
  for (const u of alreadyV3.slice(0, 5)) console.error(`  - ${u.book}/${u.file}`)
  console.error('  如需回滚到 v2：node scripts/convert-v3.mjs --restore')
  process.exit(1)
}
const notV2 = units.filter((u) => u.words.some((w) => !('pos' in w)))
if (notV2.length > 0) {
  console.error('[convert-v3] 以下文件既不是 v2 也不是 v3，请人工检查：')
  for (const u of notV2.slice(0, 5)) console.error(`  - ${u.book}/${u.file}`)
  process.exit(1)
}

for (const { book, file, src, backup, words } of units) {
  mkdirSync(dirname(backup), { recursive: true })
  copyFileSync(src, backup) // 备份 v2 原文

  const out = words.map((word) => {
    entries++
    const declared = word.pos ?? null
    const parts = splitPos(declared)
    const normalized = parts.join(' / ')
    if (declared && normalized !== declared.trim()) {
      fixedMarkers.push(`${word.english}: ${declared} → ${normalized}`)
    }

    let perSense
    if (word.senses.length === 1) {
      perSense = [declared]
    } else if (parts.length === 1) {
      perSense = word.senses.map(() => parts[0])
    } else if (PER_SENSE[word.english]) {
      perSense = PER_SENSE[word.english]
      tableHits++
    } else if (parts.length === word.senses.length) {
      perSense = parts
      warnings.push(`${word.english}（${book}/${file}）：对照表未覆盖，按声明顺序对应 ${parts.join(' / ')}`)
    } else {
      perSense = word.senses.map(() => declared)
      warnings.push(`${word.english}（${book}/${file}）：无法拆分，全部释义保留 ${declared}`)
    }

    // 声明过、但拆分后不再出现的词性段 —— 说明这些释义里没有该用法
    const used = new Set(perSense.flatMap((p) => splitPos(p)))
    const lost = parts.filter((p) => !used.has(p))
    if (lost.length > 0) dropped.push(`${word.english}: 不再出现 ${lost.join('、')}（原 ${declared}）`)

    return {
      english: word.english,
      senses: word.senses.map((sense, i) => {
        senses++
        const pos = perSense[i] ?? declared
        return { pos: pos ?? null, zh: sense.zh, en: sense.en, examples: sense.examples }
      }),
    }
  })

  writeFileSync(src, `${JSON.stringify(out, null, '\t')}\n`)
}

console.log(`[convert-v3] 处理词条 ${entries} 条 / 释义 ${senses} 条；对照表命中 ${tableHits} 条`)
console.log(`[convert-v3] v2 原文已备份到 archive/v2-json/`)
if (fixedMarkers.length > 0) {
  console.log(`[convert-v3] 修正重复词性标记 ${fixedMarkers.length} 处：`)
  for (const line of fixedMarkers) console.log(`  - ${line}`)
}
if (dropped.length > 0) {
  console.log(`[convert-v3] 拆分后不再出现的词性段 ${dropped.length} 条（该词现有释义里没有这种用法）：`)
  for (const line of dropped) console.log(`  - ${line}`)
}
if (warnings.length > 0) {
  console.log(`[convert-v3] 需要人工复核 ${warnings.length} 条：`)
  for (const line of warnings) console.log(`  - ${line}`)
  process.exitCode = 1
}
