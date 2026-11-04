'use client'

import * as React from 'react'
import { Button, Callout, Container, Flex } from '@radix-ui/themes'
import { flushPendingSaves, getSaveError, getServerSaveError, subscribeSaveError } from '@/lib/persistence'

export function SaveStatus() {
  const error = React.useSyncExternalStore(subscribeSaveError, getSaveError, getServerSaveError)
  if (!error) return null
  return (
    <Container size="3" px="4" pt="3">
      <Callout.Root color="red" role="alert">
        <Flex direction="column" align="start" gap="2">
          <Callout.Text>练习记录未能保存，请保持页面打开并重试。{error.message}</Callout.Text>
          <Button color="red" variant="soft" onClick={() => {
            try { flushPendingSaves() } catch { /* 保留错误提示，允许再次重试。 */ }
          }}>重试保存</Button>
        </Flex>
      </Callout.Root>
    </Container>
  )
}
