'use client'

import Link from 'next/link'
import { ArrowRight, CalendarDays, Flame, NotebookText } from 'lucide-react'
import { Badge, Box, Button, Card, Flex, Heading, Text } from '@radix-ui/themes'
import { useDayStats } from '@/lib/hooks'
import { EMPTY_DAY, dayKey, recentDays, streakDays, summarizeDay } from '@/lib/stats'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'] as const

function weekdayLabel(key: string, today: string) {
  if (key === today) return '今'
  return WEEKDAYS[new Date(`${key}T00:00:00`).getDay()]
}

/** 首页学习概览：今日数据与一周节奏放在同一张稳定布局的卡片里。 */
export function TodayCard({ dueCount = 0 }: { dueCount?: number }) {
  const days = useDayStats()
  const today = dayKey()
  const { words, accuracy, durationText } = summarizeDay(days[today] ?? EMPTY_DAY)
  const streak = streakDays(days, today)
  const recent = recentDays(days, today, 7)
  const max = Math.max(1, ...recent.map((d) => d.stat.words))
  const weekTotal = recent.reduce((sum, day) => sum + day.stat.words, 0)
  const chartLabel = `近 7 天练习量：${recent
    .map((day) => `${weekdayLabel(day.key, today)} ${day.stat.words} 词`)
    .join('，')}`

  return (
    <Card size={{ initial: '2', sm: '3' }} className="today-card anim-in-up">
      <div className="today-grid">
        <Flex direction="column" justify="between" gap="4" className="today-copy">
          <Box>
            <Flex align="center" gap="2">
              <CalendarDays size={16} aria-hidden="true" />
              <Heading as="h2" size="2">
                今日学习
              </Heading>
            </Flex>
            <Flex align="baseline" gap="2" mt="2">
              <Text className="today-count tabular-nums">{words}</Text>
              <Text size="3" color="gray">
                词
              </Text>
            </Flex>
            <Text as="p" size="2" color="gray" mt="1">
              {words === 0
                ? '今天还没开始'
                : `首次正确率 ${accuracy}% · 用时 ${durationText}`}
            </Text>
          </Box>

          <Flex gap="2" wrap="wrap" align="center">
            {streak > 0 && (
              <Badge color="amber" variant="soft" size="2">
                <Flame size={13} aria-hidden="true" />
                连续 {streak} 天
              </Badge>
            )}
            {dueCount > 0 && (
              <Button asChild variant="soft" size="2" className="today-review-action">
                <Link href="/practice?review=1" aria-label={`开始今日复习，${dueCount} 词到期，每轮最多 20 词`}>
                  <NotebookText size={13} aria-hidden="true" />
                  待复习 {dueCount}
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </Button>
            )}
          </Flex>
        </Flex>

        <Box className="today-week">
          <Flex align="center" justify="between" gap="3" mb="3">
            <Text size="1" weight="medium" color="gray">
              近 7 天
            </Text>
            <Text size="1" color="gray" className="tabular-nums">
              {weekTotal > 0 ? `共 ${weekTotal} 词` : '等待第一次练习'}
            </Text>
          </Flex>
          <div className="today-chart" role="img" aria-label={chartLabel}>
            {recent.map((d, i) => (
              <div
                key={d.key}
                className="today-chart-day"
                data-today={i === recent.length - 1}
                data-empty={d.stat.words === 0}
              >
                <div className="today-bar-track">
                  <span
                    className="today-bar-fill"
                    style={{
                      height:
                        d.stat.words > 0
                          ? `${Math.max(5, Math.round((d.stat.words / max) * 100))}%`
                          : '0',
                    }}
                  />
                </div>
                <Text as="span" size="1" color="gray">
                  {weekdayLabel(d.key, today)}
                </Text>
              </div>
            ))}
          </div>
        </Box>
      </div>
    </Card>
  )
}
