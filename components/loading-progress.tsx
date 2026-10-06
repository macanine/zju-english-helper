import { Flex, Progress, Text } from '@radix-ui/themes'

interface LoadingProgressProps {
  label?: string
  loaded?: number
  total?: number
}

/** 统一的异步加载反馈：已知单元数时显示百分比，否则使用不定进度条。 */
export function LoadingProgress({
  label = '正在加载…',
  loaded,
  total,
}: LoadingProgressProps) {
  const hasTotal = typeof total === 'number' && total > 0
  const value = hasTotal
    ? Math.min(100, Math.round(((loaded ?? 0) / total) * 100))
    : undefined
  const detail = hasTotal ? `${loaded ?? 0} / ${total}` : '请稍候'

  return (
    <Flex direction="column" gap="2" role="status" aria-live="polite">
      <Flex justify="between" gap="3" align="center">
        <Text size="2" color="gray">{label}</Text>
        <Text size="1" color="gray" className="tabular-nums">{detail}</Text>
      </Flex>
      <Progress value={value} size="2" aria-label={label} />
    </Flex>
  )
}
