'use client'

import { Button, Callout, Flex } from '@radix-ui/themes'
import { resetPrefs } from '@/lib/storage'

export function PrefsError({ error }: { error: string }) {
  const reset = () => {
    resetPrefs()
    window.location.reload()
  }

  return (
    <Callout.Root color="red" role="alert">
      <Flex align="center" justify="between" gap="3" wrap="wrap">
        <Callout.Text>显示设置无法读取：{error}</Callout.Text>
        <Button color="red" variant="soft" size="2" onClick={reset}>
          重置显示设置
        </Button>
      </Flex>
    </Callout.Root>
  )
}
