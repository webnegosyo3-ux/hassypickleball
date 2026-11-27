import { LoadingScreen, Skeleton } from '@/components/ui/skeleton'
import { getCourtDayAvailability } from '@/features/booking/server/availability'
import { getMonthOpenSlots } from '@/features/booking/server/month-availability'
import { CourtBookingForm } from '@/features/booking/ui/court-booking-form'
import { serialiseSlot } from '@/features/booking/view/availability-payload'
import { buildDurationOptions } from '@/features/booking/view/court-detail'
import { monthOf } from '@/features/booking/view/month-calendar'
import { submitCheckoutAction } from '@/features/checkout/actions'
import { publishPaymentMethod } from '@/features/checkout/view/payment-method'
import { listActivePaymentMethods } from '@/lib/repositories/payment-methods'
import { listActiveProducts } from '@/lib/repositories/products'
import { createSupabasePublicClient } from '@/lib/supabase/public'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { Club, Court } from '@/lib/repositories/mappers'

/**
 * The booking half of the court detail page, read on the server.
 *
 * Split out from the page so the photo, name and blurb can paint before the
 * calendar exists — the calendar is the slow half, and the page used to show
 * nothing at all until it had arrived.
 *
 * The club and the court come from the caller because the page already holds
 * them from the cached catalog; only what can change minute to minute is read
 * here, in one parallel wave: the day's times, the month's counts behind the
 * calendar, the add-ons, and how the club takes money.
 */

type CourtBookingSectionProps = {
  readonly club: Club
  readonly court: Court
  /** Club-local calendar day the page was rendered for, "YYYY-MM-DD". */
  readonly day: string
  /** Club-local today, "YYYY-MM-DD" — the past is never offered. */
  readonly today: string
  readonly durationMinutes: number
  /** A start time the customer arrived with, already selected. */
  readonly preselectedAt: string | null
}

export async function CourtBookingSection({
  club,
  court,
  day,
  today,
  durationMinutes,
  preselectedAt,
}: CourtBookingSectionProps) {
  // Payment methods are published rows; the cookie client is enough and it
  // keeps this read off the service-role key the storefront does not need.
  const client = await createSupabaseServerClient()

  const [availability, products, paymentMethods, monthCounts] = await Promise.all([
    getCourtDayAvailability({ club, court, day, durationMinutes }),
    listActiveProducts(createSupabasePublicClient(), club.id),
    listActivePaymentMethods(client, club.id),
    getMonthOpenSlots({
      club,
      courts: [court],
      month: monthOf(day),
      durationMinutes,
    }),
  ])

  // Café items belong to the shop, not to a court session.
  const addons = products
    .filter((product) => product.type === 'addon')
    .map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      priceCents: product.priceCents,
    }))

  return (
    <CourtBookingForm
      clubId={club.id}
      courtId={court.id}
      courtName={court.name}
      currency={club.currency}
      timeZone={club.timeZone}
      cancellationWindowHours={club.cancellationWindowHours}
      capacity={{
        minPlayers: court.minPlayers,
        includedPlayers: court.includedPlayers,
        maxPlayers: court.maxPlayers,
        extraPlayerFeeCents: court.extraPlayerFeeCents,
      }}
      durations={buildDurationOptions({ club, durationMinutes }).map((option) => ({
        minutes: option.minutes,
        label: option.label,
      }))}
      today={today}
      initialDay={day}
      initialDuration={durationMinutes}
      initialSlots={availability.success ? availability.data.map(serialiseSlot) : []}
      initialOpenByDay={monthCounts.success ? monthCounts.data : {}}
      preselectedAt={preselectedAt}
      addons={addons}
      paymentMethods={paymentMethods.map(publishPaymentMethod)}
      onSubmit={submitCheckoutAction}
    />
  )
}

/**
 * What the page shows while the day's times are being read.
 *
 * The same shape as the real thing — details, calendar, summary — so the page
 * does not jump when the times land.
 */
export function BookingPickerSkeleton() {
  return (
    <LoadingScreen label="Loading times" className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-5">
        <div className="rounded-[18px] border border-line bg-surface p-5 sm:p-6">
          <Skeleton className="mx-auto h-6 w-36" />
          <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_unused, index) => (
              <Skeleton key={index} className="h-11 w-full" />
            ))}
          </div>
        </div>

        <div className="rounded-[18px] border border-line bg-surface p-5 sm:p-6">
          <Skeleton className="mx-auto h-6 w-48" />
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
            <Skeleton className="h-[286px] w-full" />
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {Array.from({ length: 12 }, (_unused, index) => (
                <Skeleton key={index} className="h-[54px] w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[18px] border border-line bg-surface p-5 sm:p-6">
        <Skeleton className="mx-auto h-5 w-32" />
        <Skeleton className="mt-3 h-4 w-3/4" />
        <Skeleton className="mt-6 h-4 w-full" />
        <Skeleton className="mt-6 h-12 w-full" />
      </div>
    </LoadingScreen>
  )
}
