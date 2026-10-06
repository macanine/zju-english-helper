import { Flex } from '@radix-ui/themes'
import { LoadingProgress } from '@/components/loading-progress'

interface CardSkeletonProps {
  label?: string
  loaded?: number
  total?: number
}

/** 数据就绪前的占位卡片（静态导出的首屏骨架） */
export function CardSkeleton({ label, loaded, total }: CardSkeletonProps) {
  return (
    <Flex direction="column" gap="3">
      <LoadingProgress label={label} loaded={loaded} total={total} />
      <div className="h-80 animate-pulse rounded-2xl bg-[var(--gray-a3)]" />
    </Flex>
  )
}
