'use client'

import * as React from 'react'
import { Database, Keyboard, Layers, NotebookText } from 'lucide-react'
import { Box, Container, Flex, Heading, Kbd, Separator, Text } from '@radix-ui/themes'
import { SectionCard } from '@/components/section-card'

function Item({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="help-item">
      <Box>{label}</Box>
      <Text as="div" size="2" className="min-w-0 flex-1" style={{ lineHeight: 1.7 }}>
        {children}
      </Text>
    </div>
  )
}

export function HelpView() {
  return (
    <Container size="3" px="4" py="6">
      <Flex direction="column" gap="4">
        <Heading as="h2" size="5">
          帮助
        </Heading>

        <SectionCard icon={<Layers size={16} />} title="练习模式">
          <Item label="单词">看词性和中文释义默写。</Item>
          <Separator size="4" />
          <Item label="听写">听发音后默写；支持云端和本地浏览器朗读，云端失败时自动使用浏览器语音。可在设置中关闭练习朗读。</Item>
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

        <SectionCard icon={<NotebookText size={16} />} title="复习本">
          <Text as="div" size="2" style={{ lineHeight: 1.7 }}>
            答错自动加入，也可手动添加重点或收藏。收藏不会自动安排复习；加入计划后立即到期，每轮最多 20 词。
          </Text>
          <Text size="2">到期时无提示首次答对，依次安排 1、2、4、7、15、30 天后复习，最后通过后成为已稳固。使用提示、看答案或打错后修正需重学，10 分钟后再次到期；跳过保留任务。提前练习答对不推迟计划。</Text>
          <Text size="2">暂停只停止计划；再次答错会重新加入。已稳固词默认不进入常规练习，可在首页「更多选项」开启「包含已稳固词」。</Text>
        </SectionCard>

        <SectionCard icon={<Database size={16} />} title="数据备份">
          <Text as="div" size="2" style={{ lineHeight: 1.7 }}>
            在设置页导出或导入备份。上一版错题和已掌握词会自动升级，原数据保留为「升级前备份」；支持导入上一版 v2 备份。
          </Text>
        </SectionCard>
      </Flex>
    </Container>
  )
}
