'use client'

import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Whether this page has already taken a booking.
 *
 * Once the booking goes through, the confirmation replaces the form — but the
 * court's own summary sits above the form as a server-rendered sibling, and a
 * server component has no way to hear that the leaf below it succeeded. This is
 * the smallest thing that lets it: one flag, one setter, and a slot for the
 * part that has to go away.
 */

export type BookingStageValue = {
  readonly hasBooked: boolean
  /** Called once the booking is confirmed; hides the court summary. */
  readonly markBooked: () => void
}

/**
 * What a form rendered outside a stage sees. Nothing is ever hidden from it,
 * which keeps the form testable and reusable on its own.
 */
const NO_STAGE: BookingStageValue = { hasBooked: false, markBooked: () => {} }

const BookingStageContext = createContext<BookingStageValue>(NO_STAGE)

export function useBookingStage(): BookingStageValue {
  return useContext(BookingStageContext)
}

export type BookingStageProps = {
  /** Shown until a booking is confirmed: the court's photo, price and details. */
  readonly summary: ReactNode
  /** The booking flow itself. Never hidden — it becomes the confirmation. */
  readonly children: ReactNode
}

export function BookingStage({ summary, children }: BookingStageProps) {
  const [hasBooked, setHasBooked] = useState(false)

  const value = useMemo<BookingStageValue>(
    () => ({ hasBooked, markBooked: () => setHasBooked(true) }),
    [hasBooked],
  )

  return (
    <BookingStageContext.Provider value={value}>
      {/* No wrapper element: the summary and the form are laid out by the page
          they sit in, and adding a div here would break that grid. */}
      {hasBooked ? null : summary}
      {children}
    </BookingStageContext.Provider>
  )
}
