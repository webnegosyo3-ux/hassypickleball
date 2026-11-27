'use client'

import { formatMoney } from '@/lib/format/money'
import { formatTimeInZone } from '@/lib/format/time'
import type { AvailabilitySlot } from '@/lib/services/availability'

type SlotGridProps = {
  readonly slots: readonly AvailabilitySlot[]
  readonly timeZone: string
  readonly currency: string
  readonly selectedStartsAt?: Date | null
  readonly onSelect: (slot: AvailabilitySlot) => void
}

/**
 * The start-time picker.
 *
 * Taken slots are rendered disabled rather than removed, matching the design —
 * seeing that 7pm is gone is information. "Booked" and "Blocked" are in the
 * accessible name, so the state is not carried by colour alone, and the two
 * are told apart because a slot the club is holding is not a slot a customer
 * lost.
 */
export function SlotGrid({
  slots,
  timeZone,
  currency,
  selectedStartsAt = null,
  onSelect,
}: SlotGridProps) {
  if (slots.length === 0) {
    return (
      <p className="rounded-[12px] border border-line bg-surface-sunken px-4 py-6 text-center text-[14px] text-muted">
        No start times left on this day. Try another date or a shorter session.
      </p>
    )
  }

  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2.5">
      {slots.map((slot) => {
        const time = formatTimeInZone(slot.startsAt, timeZone)
        const isSelected = selectedStartsAt?.getTime() === slot.startsAt.getTime()
        const takenLabel = slot.isPast ? 'past' : slot.isBlocked ? 'blocked' : 'booked'
        const label = slot.isAvailable
          ? `${time}, ${formatMoney(slot.priceCents, currency)}`
          : `${time}, ${takenLabel}`

        return (
          <li key={slot.startsAt.toISOString()}>
            <button
              type="button"
              disabled={!slot.isAvailable}
              aria-pressed={isSelected}
              aria-label={label}
              onClick={() => onSelect(slot)}
              className={buttonClass(slot.isAvailable, isSelected, slot.isPast)}
            >
              <span className="text-[15px] font-bold">{time}</span>
              <span className="text-[12px] font-medium opacity-80">
                {slot.isAvailable
                  ? formatMoney(slot.priceCents, currency)
                  : slot.isPast
                    ? 'Past'
                    : slot.isBlocked
                      ? 'Blocked'
                      : 'Booked'}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function buttonClass(isAvailable: boolean, isSelected: boolean, isPast = false): string {
  const base = 'flex w-full flex-col items-center gap-0.5 rounded-[12px] border px-3 py-2.5'

  if (!isAvailable) {
    return `${base} cursor-not-allowed border-line bg-surface-sunken text-subtle line-through${isPast ? ' opacity-50' : ''}`
  }

  if (isSelected) {
    return `${base} border-navy bg-navy text-white`
  }

  return `${base} border-line bg-surface text-ink hover:border-navy`
}
