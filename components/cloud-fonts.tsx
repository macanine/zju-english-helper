'use client'

import * as React from 'react'

const STYLESHEETS = [
  ...['Regular', 'Medium', 'Demibold', 'Bold'].map(
    (weight) => `https://cdn.jsdelivr.net/npm/misans@5.0.0/lib/Normal/MiSans-${weight}.min.css`,
  ),
  'https://fonts.googleapis.cn/css2?family=Lora:ital,wght@0,400..700;1,400..700&display=swap',
]

/** 首屏先使用系统字体；空闲时再加载云端字体，失败时保留原有回退字体。 */
export function CloudFonts() {
  React.useEffect(() => {
    let timer: number | undefined
    let idle: number | undefined

    const load = () => {
      idle = undefined
      for (const href of STYLESHEETS) {
        const exists = Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
          .some((link) => link.href === href)
        if (exists) continue
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = href
        link.setAttribute('fetchpriority', 'low')
        link.addEventListener('error', () => link.remove(), { once: true })
        document.head.appendChild(link)
      }
    }

    const schedule = () => {
      if (timer !== undefined || idle !== undefined) return
      timer = window.setTimeout(() => {
        timer = undefined
        if (typeof window.requestIdleCallback === 'function') {
          idle = window.requestIdleCallback(load, { timeout: 2000 })
        } else {
          load()
        }
      }, 1500)
    }

    schedule()
    window.addEventListener('online', schedule)
    return () => {
      window.removeEventListener('online', schedule)
      if (timer !== undefined) window.clearTimeout(timer)
      if (idle !== undefined) window.cancelIdleCallback?.(idle)
    }
  }, [])

  return null
}
