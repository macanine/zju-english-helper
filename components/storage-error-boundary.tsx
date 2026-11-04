'use client'

import * as React from 'react'
import { Button, Card, Container, Flex, Heading, Text } from '@radix-ui/themes'
import { resetUserData } from '@/lib/storage'

interface State {
  error: Error | null
}

export class StorageErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  reset = () => {
    resetUserData()
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <Container size="3" px="4" py="6">
        <Card size={{ initial: '2', sm: '3' }}>
          <Flex direction="column" align="center" gap="4" py="6">
            <Heading as="h2" size="4">本地数据无法读取</Heading>
            <Text size="2" color="gray" align="center">
              本地数据读取或升级未完成。原数据不会因升级失败而被删除，请检查浏览器存储后重试。{this.state.error.message}
            </Text>
            <Button onClick={() => window.location.reload()}>重试读取</Button>
            <Button variant="soft" color="gray" onClick={() => {
              const data: Record<string, string | null> = {}
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i)
                if (key?.startsWith('zjueh.')) data[key] = localStorage.getItem(key)
              }
              const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
              const a = document.createElement('a'); a.href = url; a.download = 'daiying-moxieqi-recovery-raw.json'; a.click()
              URL.revokeObjectURL(url)
            }}>导出原始数据</Button>
          </Flex>
        </Card>
      </Container>
    )
  }
}
