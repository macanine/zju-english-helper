import { dayKey } from './stats'

/** 备份覆盖的键：错题本 / 设置 / 偏好 / 单词记录 / 每日记录 / 已掌握 */
const BACKUP_KEYS = [
  'zjueh.wrong-words',
  'zjueh.mastered',
  'zjueh.settings',
  'zjueh.prefs',
  'zjueh.word-stats',
  'zjueh.day-stats',
] as const

interface BackupFile {
  app: 'zjueh'
  version: 1
  exportedAt: string
  data: Record<string, unknown>
}

export function buildBackup(): BackupFile {
  const data: Record<string, unknown> = {}
  for (const key of BACKUP_KEYS) {
    const raw = localStorage.getItem(key)
    if (raw === null) continue
    try {
      data[key] = JSON.parse(raw)
    } catch {
      /* 损坏的条目跳过，不让整份备份失败 */
    }
  }
  return { app: 'zjueh', version: 1, exportedAt: new Date().toISOString(), data }
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
  const data = (parsed as Partial<BackupFile> | null)?.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: '文件结构不对：缺少 data 字段，可能不是本工具导出的备份。' }
  }
  let keys = 0
  try {
    for (const key of BACKUP_KEYS) {
      if (!(key in data)) continue
      localStorage.setItem(key, JSON.stringify((data as Record<string, unknown>)[key]))
      keys++
    }
  } catch {
    return { ok: false, error: '写入本地存储失败（可能处于隐私模式或空间不足）。' }
  }
  if (keys === 0) return { ok: false, error: '备份里没有可导入的数据。' }
  return { ok: true, keys }
}
