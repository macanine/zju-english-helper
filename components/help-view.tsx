'use client'

import * as React from 'react'
import { Database, Keyboard, Layers, NotebookText } from 'lucide-react'
import { Box, Container, Flex, Heading, Kbd, Separator, Text } from '@radix-ui/themes'
import { SectionCard } from '@/components/section-card'

function Item({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <Flex gap="3" align="baseline" wrap="wrap">
      <Box className="w-24 shrink-0">{label}</Box>
      <Text as="div" size="2" className="min-w-0 flex-1" style={{ lineHeight: 1.7 }}>
        {children}
      </Text>
    </Flex>
  )
}

export function HelpView() {
  return (
    <Container size="3" px="4" py="6">
      <Flex direction="column" gap="5">
        <Heading as="h2" size="6">
          帮助
        </Heading>

        <SectionCard icon={<Layers size={16} />} title="练习模式">
          <Item label="单词">看词性和中文释义默写。</Item>
          <Separator size="4" />
          <Item label="听写">听发音默写；不支持语音的浏览器会显示释义。</Item>
          <Separator size="4" />
          <Item label="例句填空">按例句中的词形填写空缺。</Item>
        </SectionCard>

        <SectionCard icon={<Keyboard size={16} />} title="快捷键">
          <Item label={<><Kbd>空格</Kbd> <Kbd>Enter</Kbd></>}>
            答对后立即进入下一题。
          </Item>
          <Separator size="4" />
          <Item label={<Kbd>Esc</Kbd>}>显示或收起答案；显示答案会计错。</Item>
          <Separator size="4" />
          <Item label={<Kbd>Tab</Kbd>}>跳过当前词。</Item>
          <Separator size="4" />
          <Item label={<Kbd>Backspace</Kbd>}>删除上一个字母。</Item>
        </SectionCard>

        <SectionCard icon={<NotebookText size={16} />} title="错题本">
          <Text as="div" size="2" style={{ lineHeight: 1.7 }}>
            错题按单词累计。可以标记已掌握、移除错题或开始复习。
          </Text>
        </SectionCard>

        <SectionCard icon={<Database size={16} />} title="数据备份">
          <Text as="div" size="2" style={{ lineHeight: 1.7 }}>
            在设置页导出或导入备份。
          </Text>
        </SectionCard>
      </Flex>
    </Container>
  )
}
