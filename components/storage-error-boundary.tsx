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
              当前浏览器中的数据不是本版本支持的格式。不会自动迁移旧数据，请清除本地数据后重新开始。
            </Text>
            <Button color="red" onClick={this.reset}>清除本地数据并重新开始</Button>
          </Flex>
        </Card>
      </Container>
    )
  }
}
