'use client'

import * as React from 'react'
import { Card, Flex, Heading } from '@radix-ui/themes'

/** 设置页、帮助页与错题本共用的图标标题卡片。 */
export function SectionCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <Card size="4" className="anim-in-up">
      <Flex direction="column" gap="4">
        <Flex align="center" gap="3">
          <Flex
            align="center"
            justify="center"
            className="size-8 shrink-0 rounded-lg"
            style={{ backgroundColor: 'var(--accent-a3)', color: 'var(--accent-11)' }}
          >
            {icon}
          </Flex>
          <Heading as="h3" size="3">
            {title}
          </Heading>
        </Flex>
        <Flex direction="column" gap="4">
          {children}
        </Flex>
      </Flex>
    </Card>
  )
}
