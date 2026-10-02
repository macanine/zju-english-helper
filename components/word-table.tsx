'use client'

import * as React from 'react'
import { Box, Card, Flex, Table, Text } from '@radix-ui/themes'
import { usePrefs } from '@/lib/hooks'
import { extractBlanks, type WordEntry } from '@/lib/model'
import { speak } from '@/lib/speech'
import type { EnMode, ExampleMode } from '@/lib/storage'

export interface WordSection {
  key: string
  /** 分组标题（如「Unit 1-1 · 32 词」）；不传则不渲染分组行 */
  label?: string
  words: WordEntry[]
}

interface WordDisplayProps {
  sections: WordSection[]
  /** 行内操作按钮（错题本的「已掌握 / 移除」），须是带文字的按钮；不传则没有操作区。桌面渲染在行尾，移动端渲染成词卡底部的通栏等宽按钮条 */
  renderActions?: (word: WordEntry) => React.ReactNode
  /** 单词旁的附加信息（如错误次数徽标） */
  renderMeta?: (word: WordEntry) => React.ReactNode
}

/** 词条里是否有英文解释（决定这块能不能点开） */
function hasEnglish(word: WordEntry): boolean {
  return word.senses.some((sense) => sense.en.trim() !== '')
}

/** 词条里是否有例句（决定例句收起模式能不能点开） */
function hasExamples(word: WordEntry): boolean {
  return word.senses.some((sense) => sense.examples.length > 0)
}

/**
 * 词条展示：单词 → 词性 + 中文释义 → 英文解释 → 例句，按阅读顺序紧凑排在一起，不再分列隔开。
 * 英文解释按偏好 enMode 显示：常显 / 默认收起 / 隐藏；收起时不放按钮，
 * 点词块（释义区）本身展开或收起，点单词文字则朗读。
 * 桌面端为表格，移动端切换为堆叠卡片。预习页与错题本共用。
 */
export function WordDisplay({ sections, renderActions, renderMeta }: WordDisplayProps) {
  const [prefs] = usePrefs()
  const mode = prefs?.enMode ?? 'collapsible'
  const exampleMode = prefs?.exampleMode ?? 'always'
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set())

  const toggle = React.useCallback((english: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(english)) next.delete(english)
      else next.add(english)
      return next
    })
  }, [])

  /** 「默认收起」模式下，词条里有可收起的内容（英文解释 / 例句）时，词块才承担展开 / 收起 */
  const collapsible = (word: WordEntry) =>
    (mode === 'collapsible' && hasEnglish(word)) ||
    (exampleMode === 'collapsible' && hasExamples(word))

  return (
    <>
      {/* 桌面：词典表格 */}
      <div className="anim-in-up max-md:hidden">
        <Table.Root variant="surface" size="3">
          <Table.Body>
            {sections.map((sec) => (
              <React.Fragment key={sec.key}>
                {sec.label && (
                  <Table.Row>
                    <Table.Cell colSpan={renderActions ? 3 : 2} className="cell-group-label" style={{ textAlign: 'center' }}>
                      <Text
                        as="div"
                        size="2"
                        weight="medium"
                        color="gray"
                        className="tracking-[0.18em]"
                      >
                        {sec.label}
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                )}
                {sec.words.map((word) => {
                  const open = expanded.has(word.english)
                  const actions = renderActions?.(word)
                  return (
                    <Table.Row
                      key={word.english}
                      className="cursor-pointer"
                      onClick={() =>
                        collapsible(word) ? toggle(word.english) : speak(word.english)
                      }
                    >
                      {/* 没有表头行，列宽在单元格上给：单词列固定占比，释义列吃掉剩下的 */}
                      <Table.Cell pl="6" style={{ width: '22%' }}>
                        <Flex align="baseline" gap="2" wrap="wrap">
                          <WordText english={word.english} />
                          {renderMeta?.(word)}
                        </Flex>
                      </Table.Cell>
                      <Table.Cell pr={renderActions ? undefined : '6'}>
                        <Meanings
                          word={word}
                          mode={mode}
                          exampleMode={exampleMode}
                          open={open}
                          collapsible={collapsible(word)}
                          onToggle={() => toggle(word.english)}
                        />
                      </Table.Cell>
                      {renderActions && (
                        <Table.Cell justify="end" pr="4" style={{ width: '1%' }}>
                          <Flex gap="2" justify="end" align="center" style={{ width: 'max-content' }} onClick={(e) => e.stopPropagation()}>
                            {actions}
                          </Flex>
                        </Table.Cell>
                      )}
                    </Table.Row>
                  )
                })}
              </React.Fragment>
            ))}
          </Table.Body>
        </Table.Root>
      </div>

      {/* 移动端：堆叠卡片。分组标题收进卡片内部居中，四周间距由卡片 padding 统一；
          卡片之间 16px（space-y），与页面留白同宽 */}
      <div className="anim-in-up md:hidden space-y-4">
        {sections.map((sec) => (
          <section key={sec.key}>
            <Card size={{ initial: '2', sm: '3' }}>
              {sec.label && (
                <Text
                  as="div"
                  size="2"
                  weight="medium"
                  color="gray"
                  className="pt-1 pb-3 text-center tracking-[0.18em]"
                >
                  {sec.label}
                </Text>
              )}
              <Flex direction="column">
            {sec.words.map((word, i) => {
              const open = expanded.has(word.english)
              const actions = renderActions?.(word)
              return (
                <Flex
                  key={word.english}
                  direction="column"
                  gap="2"
                  py="3"
                  className={i > 0 || sec.label ? 'border-t border-[var(--gray-a3)]' : 'pb-3 pt-0'}
                >
                  {/* 词名占左、附加信息（错 N 次）顶右，把短单词腾出的空白用起来 */}
                  <Flex align="start" justify="between" gap="2">
                    <Box className="min-w-0">
                      <WordText english={word.english} />
                    </Box>
                    {renderMeta?.(word) && (
                      <Box shrink-0 className="pt-1">
                        {renderMeta(word)}
                      </Box>
                    )}
                  </Flex>
                  <Meanings
                    word={word}
                    mode={mode}
                    exampleMode={exampleMode}
                    open={open}
                    collapsible={collapsible(word)}
                    onToggle={() => toggle(word.english)}
                  />
                  {/* 操作条：通栏等宽按钮，左右边缘与上方内容严格对齐 */}
                  {actions && (
                    <div
                      className="grid auto-cols-fr grid-flow-col gap-2 border-t border-[var(--gray-a3)] pt-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {actions}
                    </div>
                  )}
                </Flex>
              )
            })}
              </Flex>
            </Card>
          </section>
        ))}
      </div>
    </>
  )
}

/** 单词本身：点它朗读（阻止冒泡，免得同时触发词块的展开 / 收起） */
function WordText({ english }: { english: string }) {
  return (
    <Text
      asChild
      size="5"
      weight="medium"
      className="serif-en cursor-pointer break-words"
    >
      <button
        type="button"
        className="word-speak"
        aria-label={`朗读 ${english}`}
        onClick={(e) => {
          e.stopPropagation()
          speak(english)
        }}
      >
        {english}
      </button>
    </Text>
  )
}

/** 词性徽章（跟着释义走，展示在中文释义前面） */
export function PosBadge({ pos }: { pos: string | null }) {
  if (!pos) return null
  return (
    <Text as="span" size="2" weight="medium" color="gray" mr="2" className="whitespace-nowrap">
      {pos}
    </Text>
  )
}

/**
 * 释义区：每条释义依次是「词性 + 中文释义 → 英文解释 → 例句」，同一词条内不额外隔开（gap 1），
 * 多条释义之间只留一点间距、不加 1. 2. 编号。英文解释按 enMode、例句按 exampleMode（设置页「显示」）
 * 决定是否显示。可收起时整块就是开关（键盘 / 读屏也能用），没有独立的展开按钮。
 */
function Meanings({
  word,
  mode,
  exampleMode,
  open,
  collapsible,
  onToggle,
}: {
  word: WordEntry
  mode: EnMode
  /** 例句显示方式（设置页「显示 → 例句」，与英文解释的三态一致） */
  exampleMode: ExampleMode
  open: boolean
  collapsible: boolean
  onToggle: () => void
}) {
  const showEn = mode === 'always' || (mode === 'collapsible' && open)
  const showExamples = exampleMode === 'always' || (exampleMode === 'collapsible' && open)

  // 词库的例句挂在**词条**上（同一词的各释义共享同一批句子）：
  // 共享时只在最后一条释义下面印一次 —— 既不会每条释义重复同一批句子，
  // 也不会让最后一条释义看起来「没有例句」；例句各不相同（手改数据）时才各归各的释义。
  const lastIndex = word.senses.length - 1
  const sharedExamples =
    word.senses.length > 1 &&
    word.senses.every(
      (sense) => sense.examples.join('\u0000') === word.senses[0].examples.join('\u0000')
    )
  const shownExamples = new Set<string>()
  const senseExamples = word.senses.map((sense, index) => {
    if (sharedExamples) return index === lastIndex ? sense.examples : []
    const fresh = sense.examples.filter((sentence) => !shownExamples.has(sentence))
    fresh.forEach((sentence) => shownExamples.add(sentence))
    return fresh
  })

  const body = (
    <Flex direction="column" gap="3">
      {word.senses.map((sense, i) => (
        <Flex key={i} direction="column" gap="1">
          {(sense.zh || sense.pos) && (
            <Text as="div" size="2" className="break-words" style={{ lineHeight: 1.7 }}>
              <PosBadge pos={sense.pos} />
              {sense.zh}
            </Text>
          )}
          {showEn && sense.en && (
            <Text
              as="div"
              size="2"
              className="serif-en break-words"
              style={{ lineHeight: 1.7, color: 'var(--gray-11)' }}
            >
              {sense.en}
            </Text>
          )}
          {showExamples && <SenseExamples examples={senseExamples[i]} />}
        </Flex>
      ))}
    </Flex>
  )

  if (!collapsible) return body
  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={open}
      aria-label={`${open ? '收起' : '展开'} ${word.english} 的英文解释与例句`}
      className="cursor-pointer"
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          e.stopPropagation()
          onToggle()
        }
      }}
    >
      {body}
    </div>
  )
}

/** 例句：紧跟在该释义的英文解释下面，不另起区块 */
function SenseExamples({ examples }: { examples: string[] }) {
  if (examples.length === 0) return null
  return (
    <Flex direction="column" gap="1">
      {examples.map((sentence, i) => (
        <ExampleLine key={i} sentence={sentence} />
      ))}
    </Flex>
  )
}

/** 例句一行：斜体 + 稍浅的灰，和正体的英文解释区分开；[[..]] 挖空处显示句中实际出现的变形词并着色 */
function ExampleLine({ sentence }: { sentence: string }) {
  const parts = sentence.split(/\[\[.*?\]\]/)
  const blanks = extractBlanks(sentence)
  return (
    <Text
      as="div"
      size="2"
      className="serif-en break-words"
      style={{ lineHeight: 1.75, fontStyle: 'italic', color: 'var(--gray-11)' }}
    >
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          <span>{part}</span>
          {i < blanks.length && (
            <span className="not-italic font-medium" style={{ color: 'var(--accent-11)' }}>
              {blanks[i]}
            </span>
          )}
        </React.Fragment>
      ))}
    </Text>
  )
}
