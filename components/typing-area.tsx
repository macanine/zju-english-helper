'use client'

import * as React from 'react'
import { Eye, EyeOff, SkipForward, Volume2, X } from 'lucide-react'
import { Button, Card, Container, Flex, IconButton, Progress, Text } from '@radix-ui/themes'
import type { GameEngine } from '@/lib/engine'
import { usePrefs } from '@/lib/hooks'
import { extractBlanks, pickExample, type SenseCard } from '@/lib/model'
import type { Session, SessionStats } from '@/lib/session'
import { playDone, playKey, playSkip, playWrong } from '@/lib/sound'
import { speak, useCanSpeak } from '@/lib/speech'

interface TypingAreaProps {
  engine: GameEngine
  session: Session
  onExit: () => void
  onFinish: (stats: SessionStats) => void
}

type Status = 'typing' | 'complete' | 'reveal' | 'error'

interface CurrentQuestion {
  word: SenseCard
  key: string
  no: number
  total: number
}

/** 例句模式下的一句话：按 [[..]] 切开的片段 + 各空缺的变形词 */
interface Example {
  parts: string[]
  blanks: string[]
  repeated: boolean
}

type CellState = 'hint' | 'pending' | 'correct' | 'wrong'

interface Cell {
  ch: string
  typed: string
  state: CellState
}

const CELL_COLOR: Record<CellState, string> = {
  correct: 'var(--green-10)',
  wrong: 'var(--red-10)',
  hint: 'var(--accent-10)',
  pending: 'var(--gray-8)',
}

/**
 * 单词打字练习：参考 typewords 的逐字母交互 —— 对=绿、错=红（保留显示）、未打=空槽，
 * 必须全对才能继续；退格可修正（已对的字母保持绿色）。
 * 键盘：Esc 显示答案（记为错题）、Tab 跳过、空格/Enter 立即推进；退格修正字母。
 */
export function TypingArea({ engine, session, onExit, onFinish }: TypingAreaProps) {
  const [question, setQuestion] = React.useState<CurrentQuestion | null>(null)
  const [status, setStatus] = React.useState<Status>('typing')
  const [typed, setTyped] = React.useState<string[]>([])
  const [raw, setRaw] = React.useState('')
  const [peeked, setPeeked] = React.useState(false)
  const [prefs] = usePrefs()
  const canSpeak = useCanSpeak()

  const inputRef = React.useRef<HTMLInputElement>(null)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const hadMistakeRef = React.useRef(false)
  const committedRef = React.useRef(false)

  const word = question?.word ?? null
  const isExampleMode =
    session.kind === 'practice' && session.options.questionMode === 'example' && word !== null
  const isListenMode =
    session.kind === 'practice' && session.options.questionMode === 'listen' && word !== null
  const hintLen = engine.showFirstLetter && question ? 1 : 0
  const hint = word ? word.sense.zh || word.sense.en : ''
  /** 当前释义的词性：默写时作为提示和释义一起展示 */
  const pos = word?.sense.pos ?? null

  /** 「同词只考一次 · 列出全部释义」：题面把该词其余释义也列出来（例句模式除外） */
  const listAllSenses =
    session.kind === 'practice' &&
    session.options.mergeMode === 'all' &&
    !isExampleMode &&
    (word?.senses.length ?? 0) > 1

  /** 听写模式只给词性：合并出题时把该词出现过的词性都列上 */
  const listenPos = listAllSenses && word
    ? [...new Set(word.senses.map((s) => s.pos).filter(Boolean))].join(' / ')
    : pos

  // 例句：随机选一句；空缺处取 [[..]] 内的变形词（符合句子语法语态）
  const example = React.useMemo<Example | null>(() => {
    if (!isExampleMode || !word) return null
    const sentence = pickExample(word.sense.examples)
    let blanks = extractBlanks(sentence)
    let repeated = false
    if (blanks.length > 1 && new Set(blanks).size === 1) {
      blanks = [blanks[0]]
      repeated = true
    }
    return { parts: sentence.split(/\[\[.*?\]\]/), blanks, repeated }
  }, [isExampleMode, word])

  const answer = question
    ? isExampleMode && example
      ? example.blanks.join(' ')
      : question.word.english
    : ''

  /** 朗读文本：听写模式与自动朗读用；例句模式读整句（空缺按原形填回） */
  const speakText = React.useMemo(() => {
    if (!word) return ''
    if (isExampleMode && example) {
      return example.parts.map((part, i) => part + (example.blanks[i] ?? '')).join('')
    }
    return word.english
  }, [word, isExampleMode, example])

  // 格子状态在渲染期推导；typed 只存首字母提示位之后的真实输入
  const cells = React.useMemo<Cell[]>(() => {
    return answer.split('').map((ch, i) => {
      if (i < hintLen) return { ch, typed: ch, state: 'hint' }
      const t = typed[i - hintLen]
      if (!t) return { ch, typed: '', state: 'pending' }
      return { ch, typed: t, state: t.toLowerCase() === ch.toLowerCase() ? 'correct' : 'wrong' }
    })
  }, [answer, typed, hintLen])

  const complete = cells.length > 0 && cells.every((c) => c.state === 'correct' || c.state === 'hint')
  const hasWrong = cells.some((c) => c.state === 'wrong')
  const cursorIndex = Math.min(typed.length + hintLen, answer.length)

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const goNext = React.useCallback(() => {
    clearTimer()
    committedRef.current = false
    hadMistakeRef.current = false
    const next = engine.nextQuestion()
    if (next.kind === 'done') {
      onFinish(engine.stats())
      return
    }
    if (next.kind === 'no-examples') {
      setStatus('error')
      return
    }
    const [index, total] = engine.progress()
    setQuestion({ word: next.word, key: next.word.english, no: index + 1, total })
    setStatus('typing')
    setTyped([])
    setRaw('')
    setPeeked(false)
  }, [engine, onFinish])

  React.useEffect(() => {
    goNext()
    return clearTimer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    inputRef.current?.focus()
  }, [question, status])

  // 只有听写模式会在出题时朗读答案；普通默写与例句题必须先作答，避免提前泄露答案。
  React.useEffect(() => {
    if (!word || !canSpeak || !speakText || !isListenMode) return
    speak(speakText)
  }, [word, speakText, canSpeak, isListenMode])

  function commit() {
    if (committedRef.current || !question) return
    committedRef.current = true
    engine.checkAnswer(answer, {
      expected: isExampleMode ? answer : undefined,
      markWrong: hadMistakeRef.current,
    })
    goNext()
  }

  function onTypingDone() {
    if (status !== 'typing') return
    setStatus('complete')
    clearTimer()
    if (prefs?.keySound) playDone()
    // 答对后用 TTS 读一遍单词加深记忆；排队播放，不取消当前正在播的内容
    speak(answer, { queue: true })
    timerRef.current = setTimeout(commit, 420)
  }

  function typeChar(ch: string) {
    if (status !== 'typing') return
    setTyped((prev) => (prev.length >= answer.length - hintLen ? prev : [...prev, ch]))
  }

  /** 首字母已预填在格子里：用户照着整词打时把重复的第一下从输入串里去掉，保持与格子一一对应 */
  function normalizeInput(value: string): string {
    if (hintLen === 0 || typed.length > 0) return value
    return value[0]?.toLowerCase() === answer[0]?.toLowerCase() ? value.slice(1) : value
  }

  /**
   * 过滤输入串：丢弃超出答案长度的字符，以及答案该位置不是空格时的空格键
   * （避免顺手敲的空格变成「错误」，也让输入串与格子保持严格一一对应）
   */
  function acceptInput(value: string): string {
    let out = ''
    for (const ch of value) {
      if (ch === '\n' || ch === '\t') continue
      if (out.length >= answer.length - hintLen) continue
      if (ch === ' ' && answer[hintLen + out.length] !== ' ') continue
      out += ch
    }
    return out
  }

  function backspace() {
    if (status !== 'typing') return
    setTyped((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev))
  }

  /** 由隐藏输入框的新旧值差异驱动格子：退格、整段删除、粘贴都能正确落到格子上 */
  function applyDiff(oldVal: string, newVal: string) {
    if (newVal === oldVal) return
    let p = 0
    const min = Math.min(oldVal.length, newVal.length)
    while (p < min && oldVal[p] === newVal[p]) p++
    // 音效只在输入事件里响（一次输入最多一响），不放渲染副作用
    const added = newVal.slice(p)
    if (prefs?.keySound && added) {
      const anyWrong = [...added].some(
        (ch, i) => ch.toLowerCase() !== answer[hintLen + p + i]?.toLowerCase()
      )
      anyWrong ? playWrong() : playKey()
    }
    for (let i = 0; i < oldVal.length - p; i++) backspace()
    for (const ch of added) typeChar(ch)
  }

  /** Esc 显示答案（看过答案记为错题），再按一次收起 */
  function togglePeek() {
    if (!question || (status !== 'typing' && status !== 'complete')) return
    const next = !peeked
    setPeeked(next)
    if (next) hadMistakeRef.current = true
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      togglePeek()
      return
    }
    // Tab 跳过当前词；Shift+Tab 保留给浏览器 / 读屏软件切换焦点
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault()
      skip()
      return
    }
    if (status === 'complete' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      commit()
    }
  }

  function skip() {
    if (!question || (status !== 'typing' && status !== 'complete')) return
    clearTimer()
    committedRef.current = true
    engine.skipWithoutPenalty()
    if (prefs?.keySound) playSkip()
    setStatus('reveal')
    timerRef.current = setTimeout(goNext, 750)
  }

  React.useEffect(() => {
    if (status === 'typing' && complete) onTypingDone()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete, status])

  // 打到一半出现过错误（哪怕之后修正）也记出错，用于错题本与首次正确率
  React.useEffect(() => {
    if (hasWrong) hadMistakeRef.current = true
  }, [hasWrong])

  const progressValue = question ? Math.round((question.no / question.total) * 100) : 0

  return (
    <Container size="3" px="4" pt="2" pb="7" className="anim-in-up">
      <Flex align="center" gap="3" py="4">
        <IconButton variant="ghost" color="gray" size="2" onClick={onExit} aria-label="退出练习">
          <X size={16} />
        </IconButton>
        <Flex align="center" gap="3" className="min-w-0 flex-1">
          <Progress value={progressValue} size="1" className="min-w-0 flex-1" aria-label="练习进度" />
          <Text size="2" color="gray" className="tabular-nums whitespace-nowrap">
            {question ? `${question.no} / ${question.total}` : '—'}
          </Text>
        </Flex>
      </Flex>

      {status === 'error' ? (
        <Card size={{ initial: '2', sm: '3' }} style={{ borderColor: 'var(--red-a6)' }}>
          <Flex direction="column" align="center" gap="3" py="6">
            <Text size="3" color="red">
              当前词组中没有可用的例句数据（缺少 [[..]] 标记）。
            </Text>
            <Button variant="soft" color="gray" onClick={onExit}>
              返回首页
            </Button>
          </Flex>
        </Card>
      ) : (
        <Card size={{ initial: '2', sm: '3' }}>
          <Flex direction="column" gap="5">
            {/* 题目区 */}
            <div className={`practice-prompt ${isListenMode && canSpeak ? 'practice-prompt-listen' : ''}`}>
              {isExampleMode && example ? (
                <ExamplePrompt example={example} hint={hint} pos={pos} cells={cells} />
              ) : isListenMode ? (
                <>
                  {canSpeak ? (
                    <>
                      <IconButton
                        size="4"
                        variant="soft"
                        onClick={() => speak(speakText)}
                        aria-label="播放发音"
                      >
                        <Volume2 size={24} />
                      </IconButton>
                      {listenPos && (
                        <Text size="3" weight="medium" color="gray">
                          {listenPos}
                        </Text>
                      )}
                    </>
                  ) : (
                    <MeaningPrompt pos={listenPos} hint={hint} english={!word?.sense.zh} />
                  )}
                </>
              ) : (
                <Flex direction="column" gap="3">
                  <MeaningPrompt pos={pos} hint={hint} english={!word?.sense.zh} />
                  {/* 「同词只考一次 · 列出全部释义」：其余释义跟着列在下面 */}
                  {listAllSenses &&
                    word?.senses.slice(1).map((sense, i) => (
                      <MeaningPrompt key={i} pos={sense.pos} hint={sense.zh || sense.en} english={!sense.zh} secondary />
                    ))}
                </Flex>
              )}
            </div>

            {/* 打字区 */}
            <div
              className="typing-input-frame relative cursor-text select-none text-center"
              onClick={() => inputRef.current?.focus()}
            >
              <AnswerCells cells={cells} cursor={status === 'typing' ? cursorIndex : -1} />
              {/* 隐藏输入层：承载物理键盘与移动端软键盘 */}
              <input
                ref={inputRef}
                value={raw}
                onChange={(e) => {
                  const next = acceptInput(normalizeInput(e.target.value))
                  applyDiff(raw, next)
                  setRaw(next)
                }}
                onKeyDown={onKeyDown}
                readOnly={status !== 'typing'}
                inputMode="text"
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                aria-label={`输入答案：${isExampleMode ? '例句空缺处的单词' : hint}`}
                className="absolute inset-0 h-full w-full cursor-text bg-transparent text-base opacity-0 outline-none"
              />
            </div>

            {/* 看答案（Esc） */}
            {peeked && status !== 'reveal' && (
              <Text as="div" size="3" className="anim-in-up text-center">
                <Text weight="medium" className="serif-en practice-answer" style={{ color: 'var(--amber-11)' }}>
                  {answer}
                </Text>
              </Text>
            )}

            {/* 操作行 */}
            <Flex
              align="center"
              justify="center"
              gap="2"
              wrap="wrap"
              className="practice-actions min-h-10 text-center"
            >
              {status === 'reveal' ? (
                <Text size="3" className="anim-in-up serif-en practice-answer">
                  {answer}
                </Text>
              ) : status === 'complete' ? (
                null
              ) : (
                <>
                  <Button size="3" variant="soft" color="gray" onClick={skip}>
                    <SkipForward size={16} />
                    跳过
                  </Button>
                  <Button
                    size="3"
                    variant="soft"
                    color="gray"
                    onClick={togglePeek}
                  >
                    {peeked ? <EyeOff size={16} /> : <Eye size={16} />}
                    {peeked ? '收起答案' : '显示答案'}
                  </Button>
                </>
              )}
            </Flex>
          </Flex>
        </Card>
      )}

    </Container>
  )
}

/** 例句 + 空缺处：镜像打字进度（相同的多个空缺同步填充） */
function MeaningPrompt({ pos, hint, english = false, secondary = false }: {
  pos: string | null
  hint: string
  english?: boolean
  secondary?: boolean
}) {
  return (
    <div className={`practice-meaning ${secondary ? 'practice-meaning-secondary' : ''}`}>
      {pos && <span className="practice-pos">{pos}</span>}
      <span className={english ? 'serif-en' : undefined}>{hint}</span>
    </div>
  )
}

function ExamplePrompt({
  example,
  hint,
  pos,
  cells,
}: {
  example: Example
  hint: string
  pos: string | null
  cells: Cell[]
}) {
  return (
    <Flex direction="column" gap="4">
      <Text as="div" className="serif-en practice-sentence">
        {example.parts.map((part, i) => (
          <React.Fragment key={i}>
            <span>{part}</span>
            {i < example.parts.length - 1 && (
              <Blank example={example} index={i} cells={cells} />
            )}
          </React.Fragment>
        ))}
      </Text>
      <MeaningPrompt pos={pos} hint={hint} secondary />
    </Flex>
  )
}

/** 第 i 个空缺在打字格子里占的区间；多个相同空缺共享第一段 */
function blankRange(example: Example, index: number): [number, number] {
  if (example.repeated) return [0, example.blanks[0].length]
  const from = example.blanks.slice(0, index).reduce((acc, b) => acc + b.length + 1, 0)
  return [from, from + example.blanks[index].length]
}

function Blank({ example, index, cells }: { example: Example; index: number; cells: Cell[] }) {
  const [from, to] = blankRange(example, index)
  return (
    <span
      className="mx-1 inline-flex min-w-16 max-w-full flex-wrap items-end justify-center border-b-2 border-dashed px-2 font-semibold"
      style={{ borderColor: 'var(--accent-9)' }}
    >
      {cells.slice(from, to).map((c, k) =>
        c.state === 'pending' ? null : (
          <span key={k} style={{ color: CELL_COLOR[c.state] }}>
            {c.state === 'wrong' ? c.typed : c.ch}
          </span>
        )
      )}
    </span>
  )
}

function AnswerCells({ cells, cursor }: { cells: Cell[]; cursor: number }) {
  // 按完整单词换行，字号依据最长单词和输入区实际宽度缩放。
  const groups: { cell: Cell; index: number }[][] = [[]]
  cells.forEach((cell, index) => {
    if (cell.ch === ' ') {
      groups.push([{ cell, index }], [])
    } else {
      groups[groups.length - 1].push({ cell, index })
    }
  })
  const longest = Math.max(1, ...groups.map((group) => group.length))
  return (
    <div
      className="answer-cells font-mono font-medium"
      style={{ fontSize: `clamp(14px, calc((100cqw - 32px) / ${longest * 0.86}), 36px)` }}
      aria-hidden="true"
    >
      {groups.filter((group) => group.length > 0).map((group) => (
        <span key={group[0].index} className="answer-word">
          {group.map(({ cell: c, index: i }) => {
            const isCursor = i === cursor
            const isSpace = c.ch === ' '
            const shown = c.state === 'wrong' ? c.typed : c.ch
            return (
              <span
                key={i}
                className={`relative inline-flex justify-center border-b-2 ${isSpace ? 'w-[0.55em]' : 'w-[0.72em]'}`}
                style={{
                  borderColor: c.state === 'pending' ? 'var(--gray-6)' : CELL_COLOR[c.state],
                  paddingBottom: '0.06em',
                }}
              >
                <span
                  style={{
                    color: c.state === 'pending' ? 'transparent' : CELL_COLOR[c.state],
                    fontStyle: c.state === 'wrong' ? 'normal' : undefined,
                  }}
                >
                  {isSpace ? '\u00a0' : shown}
                </span>
                {isCursor && <Cursor />}
              </span>
            )
          })}
        </span>
      ))}
    </div>
  )
}

function Cursor() {
  return (
    <span
      aria-hidden
      className="u-blink absolute left-1/2 top-1/2 h-[1.1em] w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={{ backgroundColor: 'var(--accent-9)' }}
    />
  )
}
