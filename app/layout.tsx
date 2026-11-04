import type { Metadata, Viewport } from 'next'
import { Box, Flex, Theme } from '@radix-ui/themes'
import '@radix-ui/themes/styles.css'
import './globals.css'
import { AppHeader } from '@/components/app-header'
import { CloudFonts } from '@/components/cloud-fonts'
import { StorageErrorBoundary } from '@/components/storage-error-boundary'
import { SaveStatus } from '@/components/save-status'

export const metadata: Metadata = {
  title: { default: '大英默写器 Pro', template: '%s · 大英默写器 Pro' },
  description: 'ZJU 大英单词短语背诵工具',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fdfdfc' },
    { media: '(prefers-color-scheme: dark)', color: '#111113' },
  ],
}

const themeInitScript = `
try {
  var t = localStorage.getItem('zjueh.theme');
  if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
} catch (e) {}
`

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="antialiased pb-[env(safe-area-inset-bottom)]">
        <CloudFonts />
        {/* appearance="inherit"：跟随 <html> 上的 .dark 类，暗色切换由 theme-toggle 完成 */}
        <Theme appearance="inherit" accentColor="indigo" grayColor="slate" radius="large">
          <Flex direction="column" className="min-h-dvh">
            <StorageErrorBoundary>
              <AppHeader />
              <SaveStatus />
              <Box asChild flexGrow="1">
                <main className="app-main">{children}</main>
              </Box>
            </StorageErrorBoundary>
          </Flex>
        </Theme>
      </body>
    </html>
  )
}
