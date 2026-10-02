'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpenText, CircleHelp, Menu, NotebookText, Settings2, X } from 'lucide-react'
import {
  Badge,
  Box,
  Button,
  Container,
  Flex,
  Heading,
  IconButton,
  Portal,
  Text,
  Theme,
} from '@radix-ui/themes'
import { ThemeToggle } from '@/components/theme-toggle'
import { useWrongBook } from '@/lib/hooks'

/** 页头导航清单：桌面端内联、移动端全屏菜单，共用同一份 */
const NAV_ITEMS = [
  { href: '/browse', label: '预习词库', icon: BookOpenText },
  { href: '/wrong-words', label: '错题本', icon: NotebookText },
  { href: '/settings', label: '设置', icon: Settings2 },
  { href: '/help', label: '帮助', icon: CircleHelp },
]

/** 页头导航项（桌面端）：图标 + 文字（小屏只留图标，aria-label 保证可访问名不塌） */
function NavItem({
  href,
  icon,
  label,
  ariaLabel,
}: {
  href: string
  icon: React.ReactNode
  label: string
  ariaLabel?: string
}) {
  return (
    <Button asChild variant="ghost" color="gray" size="3">
      <Link href={href} aria-label={ariaLabel ?? label}>
        {icon}
        <span className="max-sm:hidden">{label}</span>
      </Link>
    </Button>
  )
}

/**
 * 移动端全屏菜单。必须走 Portal 挂到 body：
 * header 有 backdrop-blur，会成为 fixed 子元素的包含块，菜单会被困在 64px 高的页头里。
 */
function MobileMenu({
  open,
  onClose,
  pathname,
  wrongCount,
}: {
  open: boolean
  onClose: () => void
  pathname: string
  wrongCount: number
}) {
  if (!open) return null
  return (
    <Portal>
      {/* Portal 本身不带主题包装，token（--color-panel-solid 等）在子树里解析不出来，
          必须镜像根主题的 <Theme> props 补一层 */}
      <Theme appearance="inherit" accentColor="indigo" grayColor="slate" radius="large">
        <Box className="fixed inset-0 z-50">
          <Flex
            id="app-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="导航菜单"
            direction="column"
            gap="1"
            className="anim-slide-in-right absolute inset-0 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            style={{ backgroundColor: 'var(--color-panel-solid)' }}
          >
            {/* 与原页头同高、同字号：菜单标题和「大英默写器 Pro」基线齐平 */}
            <Flex justify="between" align="center" height="64px" className="shrink-0">
              <Heading as="h2" size="4">
                菜单
              </Heading>
              <IconButton
                variant="ghost"
                color="gray"
                size="4"
                aria-label="关闭菜单"
                autoFocus
                onClick={onClose}
              >
                <X size={22} />
              </IconButton>
            </Flex>
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = pathname === href
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  onClick={onClose}
                  className="flex h-12 min-h-12 items-center gap-3 rounded-lg px-3 transition-colors hover:bg-[var(--gray-a3)]"
                  style={{
                    backgroundColor: active ? 'var(--accent-a3)' : undefined,
                    color: active ? 'var(--accent-11)' : 'var(--gray-12)',
                  }}
                >
                  <Icon size={18} className="shrink-0" />
                  <Text size="3" weight="medium" className="leading-6">
                    {label}
                  </Text>
                  {href === '/wrong-words' && wrongCount > 0 && (
                    <Badge color="red" variant="soft" size="2" className="ml-auto">
                      {wrongCount}
                    </Badge>
                  )}
                </Link>
              )
            })}
          </Flex>
        </Box>
      </Theme>
    </Portal>
  )
}

export function AppHeader() {
  const { words } = useWrongBook()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = React.useState(false)
  const menuTriggerRef = React.useRef<HTMLButtonElement>(null)

  // 菜单打开期间：锁背景滚动、Esc 关闭并将键盘焦点限制在菜单里
  React.useEffect(() => {
    if (!menuOpen) return
    const dialog = document.getElementById('app-drawer')
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        return
      }
      if (e.key !== 'Tab' || !dialog) return

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      )
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return

      const active = document.activeElement
      const outside = !(active instanceof Node) || !dialog.contains(active)
      if (e.shiftKey && (active === first || outside)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || outside)) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      window.requestAnimationFrame(() => menuTriggerRef.current?.focus())
    }
  }, [menuOpen])

  return (
    <header
      className="sticky top-0 z-40 border-b border-[var(--gray-a4)] backdrop-blur-md"
      style={{ backgroundColor: 'var(--gray-a3)' }}
    >
      {/* 用与页面相同的 Container：页头内容与页面内容共用同一条内容栏（桌面端不内缩） */}
      <Container size="3" px="4">
        <Flex align="center" justify="between" className="gap-3" height="64px">
          <Heading as="h1" size="4" className="min-w-0">
            <Link href="/" className="text-inherit no-underline whitespace-nowrap">
              大英默写器
              <Text as="span" color="indigo" className="ml-1">
                Pro
              </Text>
            </Link>
          </Heading>

          {/* 桌面：完整内联导航（显隐的响应式类不能写在 Flex 上——Themes 的 display:flex
              会盖掉 UnoCSS 的 hidden，所以包一层普通 div） */}
          <div className="max-sm:hidden">
            <Flex align="center" className="gap-2 sm:gap-5">
              <Flex align="center" className="gap-4 sm:gap-6">
                <NavItem href="/browse" icon={<BookOpenText size={18} />} label="预习" ariaLabel="预习词库" />
                <NavItem
                  href="/wrong-words"
                  icon={<NotebookText size={18} />}
                  label="错题本"
                  ariaLabel={words.length > 0 ? `错题本（${words.length} 词）` : '错题本'}
                />
              </Flex>

              <Box
                aria-hidden
                className="h-5 w-px shrink-0"
                style={{ backgroundColor: 'var(--gray-a5)' }}
              />

              <Flex align="center" className="gap-4 sm:gap-6">
                <NavItem href="/settings" icon={<Settings2 size={18} />} label="设置" />
                <NavItem href="/help" icon={<CircleHelp size={18} />} label="帮助" />
                <ThemeToggle />
              </Flex>
            </Flex>
          </div>

          {/* 移动端：保留主题切换和菜单入口，导航打开为全屏菜单 */}
          <div className="sm:hidden">
            <Flex align="center" gap="2">
              <ThemeToggle size="4" />
              <IconButton
                ref={menuTriggerRef}
                variant="ghost"
                color="gray"
                size="4"
                aria-label="打开菜单"
                aria-expanded={menuOpen}
                aria-controls="app-drawer"
                onClick={() => setMenuOpen(true)}
              >
                <Menu size={22} />
              </IconButton>
            </Flex>
          </div>
        </Flex>
      </Container>

      <MobileMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        pathname={pathname}
        wrongCount={words.length}
      />
    </header>
  )
}
