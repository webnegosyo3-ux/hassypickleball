import { LoadingScreen, Skeleton } from '@/components/ui/skeleton'

/**
 * Shown while the route itself resolves — a first visit, or a hard navigation.
 *
 * The booking grid no longer waits here: the page streams its court details
 * immediately and suspends only the availability half, so this boundary is
 * brief. It still matches the page's own shape rather than a spinner, because
 * a spinner for a page that is about to look like this reads as a stall.
 */
export default function Loading() {
  return (
    <LoadingScreen label="Loading court" className="mx-auto w-full max-w-5xl px-4 py-8">
      <Skeleton className="h-72 w-full" />
      <Skeleton className="mt-6 h-8 w-72" />
      <Skeleton className="mt-3 h-5 w-full max-w-xl" />
      <div className="mt-8 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    </LoadingScreen>
  )
}
