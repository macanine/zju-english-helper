/** 合并练习保存，在新题绘制后写入；离开页面时同步落盘。 */
const pending = new Map<string, () => void>()
const listeners = new Set<() => void>()
let error: Error | null = null
let cancelScheduled: (() => void) | null = null
let lifecycleInstalled = false

export const getSaveError = () => error
export const getServerSaveError = () => null
export function subscribeSaveError(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function setError(next: Error | null) {
  error = next
  listeners.forEach((listener) => listener())
}

/** 失败的任务保留以便重试；备份调用方收到异常，后台保存则显示错误状态。 */
export function flushPendingSaves() {
  cancelScheduled?.()
  cancelScheduled = null
  try {
    for (const [key, save] of pending) {
      save()
      pending.delete(key)
    }
    if (error) setError(null)
  } catch (cause) {
    const failure = cause instanceof Error ? cause : new Error('无法保存本地数据')
    setError(failure)
    throw failure
  }
}

function flushInBackground() {
  try { flushPendingSaves() } catch { /* 错误通过订阅显示，任务保留。 */ }
}

export function discardPendingSaves() {
  cancelScheduled?.()
  cancelScheduled = null
  pending.clear()
  if (error) setError(null)
}

export function deferSave(key: string, save: () => void) {
  if (typeof window === 'undefined') { save(); return }
  pending.set(key, save)
  if (!lifecycleInstalled) {
    window.addEventListener('pagehide', flushInBackground)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushInBackground()
    })
    lifecycleInstalled = true
  }
  if (document.visibilityState === 'hidden') { flushInBackground(); return }
  if (cancelScheduled) return
  // rAF 内只安排任务；计时器在这帧绘制后再执行序列化和 localStorage 写入。
  let timer: ReturnType<typeof setTimeout> | null = null
  const frame = window.requestAnimationFrame(() => {
    timer = setTimeout(flushInBackground, 0)
  })
  // 即使浏览器暂停 rAF，也不会一直留在内存里。
  const deadline = setTimeout(flushInBackground, 500)
  cancelScheduled = () => {
    window.cancelAnimationFrame(frame)
    if (timer !== null) clearTimeout(timer)
    clearTimeout(deadline)
  }
}
