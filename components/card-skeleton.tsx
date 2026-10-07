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
      <div className="loading-skeleton-card" aria-hidden="true">
        <span className="loading-skeleton-line loading-skeleton-line-title" />
        <span className="loading-skeleton-line" />
        <span className="loading-skeleton-line loading-skeleton-line-short" />
        <span className="loading-skeleton-block" />
      </div>
    </Flex>
  )
}
