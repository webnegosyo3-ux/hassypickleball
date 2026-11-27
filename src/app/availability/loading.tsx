import { LoadingScreen, Skeleton } from '@/components/ui/skeleton'

/**
 * Shown while the calendar's month and day are read.
 *
 * The month grid paints before any count arrives, so the placeholder is the
 * same shape as the real page — heading, controls, calendar, times — and the
 * layout does not jump when the numbers land.
 */
export default function Loading() {
  return (
    <LoadingScreen
      label="Loading availability"
      className="mx-auto w-full max-w-[1280px] px-4 pb-20 pt-6 sm:px-7"
    >
      <div className="mb-6 flex flex-col items-center gap-3">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>

      <div className="mb-5 flex justify-center gap-2">
        {Array.from({ length: 4 }, (_unused, index) => (
          <Skeleton key={index} className="h-[44px] w-20" />
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:items-start">
        <Skeleton className="h-[360px] w-full" />
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }, (_unused, index) => (
            <Skeleton key={index} className="h-[168px] w-full" />
          ))}
        </div>
      </div>
    </LoadingScreen>
  )
}
