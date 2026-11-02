'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, NotebookText, Plus, Search, MoreHorizontal } from 'lucide-react'
import { AlertDialog, Badge, Button, Checkbox, Container, Dialog, DropdownMenu, Flex, Grid, ScrollArea,
  SegmentedControl, Select, Text, TextArea, TextField } from '@radix-ui/themes'
import { SectionCard } from '@/components/section-card'
import { CardSkeleton } from '@/components/card-skeleton'
import { WordDisplay } from '@/components/word-table'
import { ReviewWordActions } from '@/components/review-word-actions'
import { useBooks, useReviewNotebook, useWordStats } from '@/lib/hooks'
import { loadWordsWithOrigins, unitLabel } from '@/lib/data'
import { dueLabel, isDue, type ReviewItem, type WordOrigin } from '@/lib/review'
import type { WordEntry } from '@/lib/model'
import type { GameEngine } from '@/lib/engine'
import { encodeSession } from '@/lib/session'

const PAGE_SIZE = 50
type Tab = 'due' | 'all' | 'favorites'
const STATUS_OPTIONS = [
  ['all', '全部状态'], ['active', '学习中'], ['consolidated', '已稳固'], ['paused', '已暂停'], ['none', '未加入计划'],
]

export function WrongWordsView() {
  const router = useRouter()
  const { engine, items } = useReviewNotebook()
  const { books } = useBooks()
  const stats = useWordStats()
  const [tab, setTab] = React.useState<Tab>('due')
  const [search, setSearch] = React.useState('')
  const deferredSearch = React.useDeferredValue(search)
  const [status, setStatus] = React.useState('all')
  const [wrongOnly, setWrongOnly] = React.useState(false)
  const [manualOnly, setManualOnly] = React.useState(false)
  const [favoriteOnly, setFavoriteOnly] = React.useState(false)
  const [book, setBook] = React.useState('all')
  const [unit, setUnit] = React.useState('all')
  const [page, setPage] = React.useState(0)
  const [now, setNow] = React.useState(Date.now())
  const [detail, setDetail] = React.useState<string | null>(null)
  const [remove, setRemove] = React.useState<string | null>(null)
  const [addOpen, setAddOpen] = React.useState(false)
  const activeFilters = [
    status !== 'all' && STATUS_OPTIONS.find(([value]) => value === status)?.[1],
    book !== 'all' && (books?.find(item => item.id === book)?.name ?? book),
    unit !== 'all' && `Unit ${unitLabel(unit)}`,
    wrongOnly && '曾答错',
    manualOnly && '手动加入',
    favoriteOnly && '已收藏',
  ].filter(Boolean)
  const clearFilters = () => {
    setStatus('all')
    setBook('all')
    setUnit('all')
    setWrongOnly(false)
    setManualOnly(false)
    setFavoriteOnly(false)
  }
  React.useEffect(() => setNow(Date.now()), [items])
  React.useEffect(() => {
    const sync = () => setNow(Date.now())
    const timer = setInterval(sync, 30_000)
    window.addEventListener('focus', sync)
    return () => { clearInterval(timer); window.removeEventListener('focus', sync) }
  }, [])
  const due = items.filter(item => isDue(item, now))
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const overdue = due.filter(item => item.schedule!.dueAt < todayStart.getTime()).length
  const nextDue = items.filter(item => item.schedule?.status === 'active' && item.schedule.dueAt > now)
    .sort((a, b) => a.schedule!.dueAt - b.schedule!.dueAt)[0]
  const filtered = React.useMemo(() => items.filter(item => {
    if (tab === 'due' && !isDue(item, now)) return false
    if ((tab === 'favorites' || favoriteOnly) && item.favoriteAt === null) return false
    if (wrongOnly && item.firstWrongAt === null) return false
    if (manualOnly && item.manuallyAddedAt === null) return false
    if (status !== 'all' && (status === 'none' ? item.schedule !== null : item.schedule?.status !== status)) return false
    if (book !== 'all' && !item.origins.some(o => o.bookId === book && (unit === 'all' || o.unitId === unit))) return false
    const text = `${item.word.english} ${item.word.senses.map(s => `${s.zh} ${s.en}`).join(' ')} ${item.note}`.toLowerCase()
    return text.includes(deferredSearch.trim().toLowerCase())
  }).sort((a, b) => tab === 'due' ? a.schedule!.dueAt - b.schedule!.dueAt ||
    (stats[b.word.english]?.wrongs ?? 0) - (stats[a.word.english]?.wrongs ?? 0) :
    tab === 'favorites' ? (b.favoriteAt ?? 0) - (a.favoriteAt ?? 0) : b.addedAt - a.addedAt),
  [items, tab, now, favoriteOnly, wrongOnly, manualOnly, status, book, unit, deferredSearch, stats])
  React.useEffect(() => setPage(0), [tab, deferredSearch, status, wrongOnly, manualOnly, favoriteOnly, book, unit])
  const pages = Math.ceil(filtered.length / PAGE_SIZE)
  const currentPage = Math.min(page, Math.max(0, pages - 1))
  React.useEffect(() => setPage(currentPage), [currentPage])
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
  const byWord = React.useMemo(() => new Map(items.map(item => [item.word.english, item])), [items])
  const selectedDetail = detail ? byWord.get(detail) : undefined

  if (!engine) return <Container size="3" px="4" py="6"><CardSkeleton /></Container>
  return <Container size="3" px="4" py="6"><Flex direction="column" gap="4">
    <SectionCard icon={<NotebookText size={16} />} title="复习本">
      <Flex align="center" justify="between" gap="3" wrap="wrap">
        <Flex direction="column" gap="1">
          <Text size="5" weight="bold">待复习 {due.length} 词</Text>
          <Text size="2" color="gray">{overdue > 0 ? `其中逾期 ${overdue} 词` : '每轮最多 20 词'}{nextDue && due.length === 0 ? ` · 下次：${dueLabel(nextDue, now)}` : ''}</Text>
        </Flex>
        <Button variant="soft" onClick={() => setAddOpen(true)}><Plus size={16} />添加重点</Button>
      </Flex>
      <Button size="3" disabled={due.length === 0} onClick={() => router.push('/practice?review=1')}>
        <NotebookText size={16} />开始今日复习
      </Button>
      <SegmentedControl.Root size="3" value={tab} aria-label="复习本视图" className="w-full"
        onValueChange={value => setTab(value as Tab)}>
        <SegmentedControl.Item value="due">今日</SegmentedControl.Item>
        <SegmentedControl.Item value="all">全部 {items.length}</SegmentedControl.Item>
        <SegmentedControl.Item value="favorites">收藏 {items.filter(i => i.favoriteAt !== null).length}</SegmentedControl.Item>
      </SegmentedControl.Root>
      <TextField.Root size="3" value={search} onChange={e => setSearch(e.target.value)} aria-label="搜索复习本" placeholder="搜索单词、释义或笔记">
        <TextField.Slot><Search size={16} /></TextField.Slot>
      </TextField.Root>
      <details className="disclosure-panel">
        <summary className="disclosure-trigger">
          <span className="disclosure-copy">
            <Text as="span" size="2" weight="medium">筛选条件</Text>
            {activeFilters.length > 0 && <Text as="span" size="1" color="gray">{activeFilters.join(' · ')}</Text>}
          </span>
          <ChevronDown size={18} className="disclosure-chevron" aria-hidden="true" />
        </summary>
        <Flex direction="column" gap="3" className="disclosure-content">
          <Grid columns={{ initial: '1', sm: '3' }} gap="3">
            <Filter label="状态" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
            <Filter label="词书" value={book} onChange={value => { setBook(value); setUnit('all') }}
              options={[['all', '全部词书'], ...(books ?? []).map(b => [b.id, b.name])]} />
            <Filter label="单元" value={unit} onChange={setUnit} options={[['all', '全部单元'],
              ...(books?.find(b => b.id === book)?.units ?? []).map(u => [u, `Unit ${unitLabel(u)}`])]} />
          </Grid>
          <Flex gap="4" wrap="wrap">
            <Text as="label" size="2" className="filter-check"><Checkbox checked={wrongOnly} onCheckedChange={v => setWrongOnly(v === true)} />曾答错</Text>
            <Text as="label" size="2" className="filter-check"><Checkbox checked={manualOnly} onCheckedChange={v => setManualOnly(v === true)} />手动加入</Text>
            <Text as="label" size="2" className="filter-check"><Checkbox checked={favoriteOnly} onCheckedChange={v => setFavoriteOnly(v === true)} />已收藏</Text>
          </Flex>
          {activeFilters.length > 0 && <Button size="2" variant="soft" color="gray" onClick={clearFilters}>清除筛选</Button>}
        </Flex>
      </details>
      {filtered.length > 0 && tab !== 'due' && <Button variant="soft" color="gray" onClick={() => router.push(`/practice?${encodeSession({ kind: 'review', scope: 'extra', words: visible.slice(0, 20).map(i => i.word.english) })}`)}>额外练习当前页（最多 20 词）</Button>}
    </SectionCard>
    {filtered.length === 0 ? <Flex direction="column" align="center" gap="3" py="6">
      <Text align="center" color="gray">{items.length === 0 ? '从词库收藏或添加重点，开始建立复习本。' : tab === 'due' && due.length === 0 ? '当前没有到期任务。' : '没有符合筛选的词。'}</Text>
      {items.length > 0 && (activeFilters.length > 0 || search.trim()) ?
        <Button variant="soft" color="gray" onClick={() => { clearFilters(); setSearch('') }}>清除筛选</Button> :
        items.length > 0 && tab === 'due' && due.length === 0 &&
          <Button variant="soft" onClick={() => setTab('all')}>查看全部词条</Button>}
    </Flex> : <>
      <WordDisplay sections={[{ key: `${tab}-${currentPage}`, words: visible.map(item => item.word) }]}
        renderMeta={word => {
          const item = byWord.get(word.english)!
          return <Flex gap="1" wrap="wrap"><Badge color={isDue(item, now) ? 'orange' : 'gray'}>{dueLabel(item, now)}</Badge>
            {item.schedule && <Badge color="gray">阶段 {item.schedule.stage}/6</Badge>}
            {(stats[word.english]?.wrongs ?? 0) > 0 && <Badge color="red">错 {stats[word.english].wrongs} 次</Badge>}
          </Flex>
        }}
        renderActions={word => {
          const item = byWord.get(word.english)!
          return <Flex gap="2" wrap="wrap">
            <ReviewWordActions engine={engine} word={word} item={item} origins={item.origins} />
            {item.schedule && <Button size="2" variant="soft" color="gray" onClick={() => item.schedule?.status === 'consolidated' ? engine.restartReview(word) : engine.pauseReview(word.english)}>
              {item.schedule.status === 'consolidated' ? '重新学习' : item.schedule.status === 'paused' ? '恢复' : '暂停'}</Button>}
            <DropdownMenu.Root><DropdownMenu.Trigger><Button size="2" variant="soft" color="gray" aria-label={`更多操作 ${word.english}`}><MoreHorizontal size={16} /></Button></DropdownMenu.Trigger>
              <DropdownMenu.Content><DropdownMenu.Item onSelect={() => setDetail(word.english)}>笔记与历史</DropdownMenu.Item>
                <DropdownMenu.Item onSelect={() => engine.restartReview(word)}>重新学习</DropdownMenu.Item>
                <DropdownMenu.Item color="red" onSelect={() => setRemove(word.english)}>从复习本移除</DropdownMenu.Item>
              </DropdownMenu.Content></DropdownMenu.Root>
          </Flex>
        }} />
      {pages > 1 && <Flex justify="center" align="center" gap="3">
        <Button variant="soft" color="gray" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</Button>
        <Text size="2" aria-live="polite">{currentPage + 1} / {pages}</Text>
        <Button variant="soft" color="gray" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>下一页</Button>
      </Flex>}
    </>}
    <AlertDialog.Root open={remove !== null} onOpenChange={open => !open && setRemove(null)}><AlertDialog.Content maxWidth="400px">
      <AlertDialog.Title>移除 {remove}？</AlertDialog.Title><AlertDialog.Description>将移除收藏、复习计划和笔记，保留累计学习统计。</AlertDialog.Description>
      <Flex justify="end" gap="3" mt="4"><AlertDialog.Cancel><Button variant="soft" color="gray">取消</Button></AlertDialog.Cancel>
        <AlertDialog.Action><Button color="red" onClick={() => { if (remove) engine.removeReviewItem(remove); setRemove(null) }}>移除</Button></AlertDialog.Action></Flex>
    </AlertDialog.Content></AlertDialog.Root>
    <Dialog.Root open={!!selectedDetail} onOpenChange={open => !open && setDetail(null)}>
      {selectedDetail && <ItemDetail key={selectedDetail.word.english} item={selectedDetail} engine={engine} />}
    </Dialog.Root>
    <AddWordsDialog open={addOpen} onOpenChange={setAddOpen} engine={engine} />
  </Flex></Container>
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  return <Flex direction="column" gap="1"><Text size="2" weight="medium">{label}</Text>
    <Select.Root size="3" value={value} onValueChange={onChange}><Select.Trigger aria-label={label} />
      <Select.Content position="popper">{options.map(([id, name]) => <Select.Item key={id} value={id}>{name}</Select.Item>)}</Select.Content>
    </Select.Root></Flex>
}

function ItemDetail({ item, engine }: { item: ReviewItem; engine: GameEngine }) {
  const [note, setNote] = React.useState(item.note)
  return <Dialog.Content maxWidth="560px" style={{ maxHeight: '85dvh' }}>
    <Dialog.Title>{item.word.english}</Dialog.Title><Dialog.Description>{dueLabel(item, Date.now())}</Dialog.Description>
    <ScrollArea style={{ height: 'min(55dvh, 460px)' }}><Flex direction="column" gap="3" pr="3">
      <Text size="2" color="gray">来源：{item.origins.length ? item.origins.map(o => `${o.bookId} · Unit ${unitLabel(o.unitId)}`).join('、') : '旧版记录或未记录词书来源'}</Text>
      <Text as="label" size="2" weight="medium" htmlFor="review-note">笔记</Text>
      <TextArea id="review-note" value={note} maxLength={2000} onChange={e => setNote(e.target.value)} placeholder="记录易混点或记忆方法" />
      <Text size="2" weight="medium">复习历史</Text>
      {item.history.length === 0 ? <Text size="2" color="gray">尚无计划复习记录</Text> : [...item.history].reverse().map(event => <Text key={event.id} size="2">
        {new Date(event.at).toLocaleString('zh-CN')} · {event.result === 'success' ? '独立答对' : '需要重学'} · 阶段 {event.fromStage} → {event.toStage}
      </Text>)}
    </Flex></ScrollArea>
    <Flex justify="end" gap="3" mt="4"><Dialog.Close><Button variant="soft" color="gray">取消</Button></Dialog.Close>
      <Dialog.Close><Button onClick={() => engine.saveNote(item.word.english, note)}>保存笔记</Button></Dialog.Close></Flex>
  </Dialog.Content>
}

function AddWordsDialog({ open, onOpenChange, engine }: { open: boolean; onOpenChange: (open: boolean) => void; engine: GameEngine }) {
  const { books } = useBooks()
  const [book, setBook] = React.useState('')
  const [unit, setUnit] = React.useState('all')
  const [search, setSearch] = React.useState('')
  const [data, setData] = React.useState<{ words: WordEntry[]; origins: Map<string, WordOrigin[]> } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [favorite, setFavorite] = React.useState(true)
  const activeBook = book || books?.[0]?.id || ''
  React.useEffect(() => {
    if (!open || !books || !activeBook) return
    let cancelled = false
    setData(null); setError(null); setSelected(new Set())
    loadWordsWithOrigins(activeBook, unit === 'all' ? books.find(b => b.id === activeBook)!.units : [unit])
      .then(result => { if (!cancelled) setData({ ...result, words: [...new Map(result.words.map(w => [w.english, w])).values()] }) })
      .catch(cause => { if (!cancelled) setError(String(cause)) })
    return () => { cancelled = true }
  }, [open, books, activeBook, unit])
  const matches = data?.words.filter(w => `${w.english} ${w.senses.map(s => s.zh).join(' ')}`.toLowerCase().includes(search.trim().toLowerCase())) ?? []
  const [limit, setLimit] = React.useState(50)
  React.useEffect(() => setLimit(50), [search, activeBook, unit, open])
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Content maxWidth="600px" style={{ maxHeight: '90dvh' }}>
    <Dialog.Title>添加重点</Dialog.Title><Dialog.Description>从词库选词，加入复习计划。</Dialog.Description>
    <Grid columns={{ initial: '1', sm: '2' }} gap="3" mb="3">
      <Filter label="添加词书" value={activeBook} onChange={value => { setBook(value); setUnit('all') }} options={(books ?? []).map(b => [b.id, b.name])} />
      <Filter label="添加单元" value={unit} onChange={setUnit} options={[['all', '全部单元'], ...(books?.find(b => b.id === activeBook)?.units ?? []).map(u => [u, `Unit ${unitLabel(u)}`])]} />
    </Grid>
    <TextField.Root value={search} onChange={e => setSearch(e.target.value)} aria-label="搜索重点词" placeholder="搜索单词或释义" mb="3" />
    <ScrollArea style={{ height: 'min(42dvh, 350px)' }}><Flex direction="column" gap="3" pr="3">
      {error && <Text color="red" role="alert">{error}</Text>}
      {!data && !error && <Text color="gray">正在加载词库…</Text>}
      {data && matches.length === 0 && <Text color="gray">没有匹配词条</Text>}
      {matches.slice(0, limit).map(word => <Text as="label" key={word.english} size="2">
        <Checkbox checked={selected.has(word.english)} onCheckedChange={checked => setSelected(prev => {
          const next = new Set(prev); if (checked) next.add(word.english); else next.delete(word.english); return next
        })} /> <Text weight="bold">{word.english}</Text> · {word.senses[0].zh || word.senses[0].en}
      </Text>)}
      {matches.length > limit && <Button variant="soft" onClick={() => setLimit(limit + 50)}>显示更多</Button>}
    </Flex></ScrollArea>
    <Flex gap="3" mt="3" direction="column">
      <Text as="label" size="2"><Checkbox checked={favorite} onCheckedChange={v => setFavorite(v === true)} /> 同时收藏</Text>
      <Flex justify="end" gap="3"><Dialog.Close><Button variant="soft" color="gray">取消</Button></Dialog.Close>
        <Button disabled={selected.size === 0} onClick={() => {
          for (const word of data?.words ?? []) if (selected.has(word.english)) engine.addToReview(word, data?.origins.get(word.english), favorite)
          onOpenChange(false); setSelected(new Set())
        }}>加入复习（{selected.size}）</Button></Flex>
    </Flex>
  </Dialog.Content></Dialog.Root>
}
