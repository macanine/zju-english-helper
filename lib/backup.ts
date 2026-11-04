import { dayKey } from './stats'
import { STORAGE_VALIDATORS, loadReviewNotebook, UPGRADE_BACKUP_KEY } from './storage'
import { upgradeCards } from './review'
import { hasFields, isRecord } from './validation'
import { flushPendingSaves } from './persistence'

/** 当前备份覆盖复习本、设置、偏好、语音及学习统计；旧集合仅用于 v2 导入。 */
type BackupKey = keyof typeof STORAGE_VALIDATORS
const BACKUP_KEYS = Object.keys(STORAGE_VALIDATORS).filter(key => !['zjueh.wrong-words', 'zjueh.mastered'].includes(key)) as BackupKey[]
const BACKUP_VERSION = 3

interface BackupFile {
  app: 'zjueh'
  version: typeof BACKUP_VERSION
  exportedAt: string
  data: Record<string, unknown>
}

export function buildBackup(): BackupFile {
  flushPendingSaves()
  loadReviewNotebook()
  const data: Record<string, unknown> = {}
  for (const key of BACKUP_KEYS) {
    const raw = localStorage.getItem(key)
    if (raw === null) continue
    const value: unknown = JSON.parse(raw)
    if (!STORAGE_VALIDATORS[key](value)) throw new Error(`数据格式无效：${key}`)
    data[key] = value
  }
  return { app: 'zjueh', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data }
}

/** 导出为 JSON 文件（本地 Blob 下载，不经过任何服务器） */
export function downloadBackup() {
  const blob = new Blob([JSON.stringify(buildBackup(), null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `daiying-moxieqi-${dayKey()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export type ImportResult = { ok: true; keys: number } | { ok: false; error: string }

/** 导入备份：整份覆盖对应键（调用方负责确认与刷新页面） */
export function importBackup(text: string): ImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: '文件不是有效的 JSON。' }
  }
  if (!hasFields(parsed, ['app', 'version', 'exportedAt', 'data']) ||
      parsed.app !== 'zjueh' || ![2, BACKUP_VERSION].includes(parsed.version as number) ||
      typeof parsed.exportedAt !== 'string' || !Number.isFinite(Date.parse(parsed.exportedAt)) ||
      !isRecord(parsed.data)) {
    return { ok: false, error: '备份格式或版本不受支持，请使用当前应用导出的备份。' }
  }
  const data = parsed.data
  if (Object.keys(data).some((key) => !Object.hasOwn(STORAGE_VALIDATORS, key))) {
    return { ok: false, error: '备份包含无法识别的数据字段。' }
  }
  if (parsed.version === 2) {
    if (Object.hasOwn(data, 'zjueh.review-notebook')) return { ok: false, error: '旧版备份包含不匹配的复习本。' }
    for (const key of ['zjueh.wrong-words', 'zjueh.mastered'] as const) {
      if (Object.hasOwn(data, key) && !STORAGE_VALIDATORS[key](data[key])) return { ok: false, error: `旧版词条格式无效：${key}` }
    }
    if (Object.hasOwn(data, 'zjueh.wrong-words') || Object.hasOwn(data, 'zjueh.mastered')) {
      data['zjueh.review-notebook'] = upgradeCards(
        (data['zjueh.wrong-words'] ?? []) as Parameters<typeof upgradeCards>[0],
        (data['zjueh.mastered'] ?? []) as Parameters<typeof upgradeCards>[1], Date.now())
    }
    delete data['zjueh.wrong-words']; delete data['zjueh.mastered']
  } else if (Object.hasOwn(data, 'zjueh.wrong-words') || Object.hasOwn(data, 'zjueh.mastered')) {
    return { ok: false, error: '当前备份不能包含旧版错题字段。' }
  }
  const keys = BACKUP_KEYS.filter((key) => Object.hasOwn(data, key))
  if (keys.length === 0) return { ok: false, error: '备份里没有可导入的数据。' }
  for (const key of keys) {
    if (!STORAGE_VALIDATORS[key](data[key])) {
      return { ok: false, error: `备份数据格式无效：${key}` }
    }
  }
  const previous = new Map<BackupKey, string | null>()
  const written: BackupKey[] = []
  try {
    flushPendingSaves()
    for (const key of keys) previous.set(key, localStorage.getItem(key))
    for (const key of keys) {
      localStorage.setItem(key, JSON.stringify(data[key]))
      written.push(key)
    }
  } catch {
    try {
      for (const key of written.reverse()) {
        const raw = previous.get(key)!
        if (raw === null) localStorage.removeItem(key)
        else localStorage.setItem(key, raw)
      }
    } catch {
      return { ok: false, error: '导入中断，部分数据未能恢复。请检查浏览器存储后重新导入。' }
    }
    return { ok: false, error: '无法写入本地存储，本次导入未生效。' }
  }
  return { ok: true, keys: keys.length }
}

export function downloadUpgradeBackup() {
  const raw = localStorage.getItem(UPGRADE_BACKUP_KEY)
  if (!raw) throw new Error('没有升级前备份')
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url; a.download = 'daiying-moxieqi-before-upgrade-v2.json'; a.click()
  URL.revokeObjectURL(url)
}
