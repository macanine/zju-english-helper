'use client'

import { Card, Flex, Text } from '@radix-ui/themes'
import { useDayStats } from '@/lib/hooks'
import { EMPTY_DAY, dayKey, recentDays, streakDays, summarizeDay } from '@/lib/stats'

/** 首页今日概览：今日词数 / 正确率 / 用时 / 连续天数 + 近 7 天迷你柱状 */
export function TodayCard() {
  const days = useDayStats()
  const today = dayKey()
  const { words, accuracy, durationText } = summarizeDay(days[today] ?? EMPTY_DAY)
  const streak = streakDays(days, today)
  const recent = recentDays(days, today, 7)
  const max = Math.max(1, ...recent.map((d) => d.stat.words))
  const hasAny = recent.some((d) => d.stat.words > 0)

  return (
    <Card size="4" className="anim-in-up">
      <Flex justify="between" align="center" gap="5" wrap="wrap">
        <Flex direction="column" gap="1">
          <Text size="2" weight="medium" color="gray">
            今日
          </Text>
          <Flex align="baseline" gap="2" wrap="wrap">
            <Text size="6" weight="medium" className="tabular-nums">
              {words}
            </Text>
            <Text size="2" color="gray">
              词
            </Text>
            {words > 0 && (
              <Text size="2" color="gray" className="tabular-nums">
                · 正确率 {accuracy}% · 用时 {durationText}
              </Text>
            )}
          </Flex>
          {streak > 0 && (
            <Text size="2" color="gray">
              连续练习 {streak} 天
            </Text>
          )}
        </Flex>

        {hasAny && (
          <Flex align="end" gap="1" className="h-10" role="img" aria-label="近 7 天练习量">
            {recent.map((d, i) => (
              <div
                key={d.key}
                className="w-2.5 rounded-full"
                style={{
                  height: `${Math.max(4, Math.round((d.stat.words / max) * 40))}px`,
                  backgroundColor:
                    i === recent.length - 1 ? 'var(--accent-9)' : 'var(--accent-a5)',
                }}
              />
            ))}
          </Flex>
        )}
      </Flex>
    </Card>
  )
}
