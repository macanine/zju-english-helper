'use client'

import * as React from 'react'
import { Moon, Sun } from 'lucide-react'
import { IconButton } from '@radix-ui/themes'

export function ThemeToggle({ size = '3' }: { size?: '1' | '2' | '3' | '4' }) {
  const [dark, setDark] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
    setDark(document.documentElement.classList.contains('dark'))
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem('zjueh.theme', next ? 'dark' : 'light')
    } catch {}
  }

  return (
    <IconButton
      variant="ghost"
      color="gray"
      size={size}
      aria-label={dark ? '切换到浅色模式' : '切换到深色模式'}
      onClick={toggle}
    >
      {mounted && dark ? <Moon size={18} /> : <Sun size={18} />}
    </IconButton>
  )
}
