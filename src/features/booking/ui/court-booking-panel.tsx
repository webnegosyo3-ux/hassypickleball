'use client'

import { useState } from 'react'
import { SlotGrid } from './slot-grid'
import { useCart } from '@/features/cart/cart-provider'
import { formatMoney } from '@/lib/format/money'
import type { AvailabilitySlot } from '@/lib/services/availability'

type CourtBookingPanelProps = {
  readonly courtId: string
  readonly courtName: string
  readonly slots: readonly AvailabilitySlot[]
  readonly timeZone: string
  readonly currency: string
}

/**
 * Client island around the slot grid: holds only the current selection and
 * hands the chosen slot to the cart. Availability itself is computed on the
 * server and passed down, so this component never fetches.
 */
export function CourtBookingPanel({
  courtId,
  courtName,
  slots,
  timeZone,
  currency,
}: CourtBookingPanelProps) {
  const { addCourt } = useCart()
  const [selected, setSelected] = useState<AvailabilitySlot | null>(null)
  const [confirmation, setConfirmation] = useState<string | null>(null)

  function handleAdd() {
    if (!selected) {
      return
    }

    // The court's name and the club's lens travel with the line: the cart is
    // read from the site header, which has no club in scope.
    addCourt({
      courtId,
      courtName,
      startsAt: selected.startsAt,
      endsAt: selected.endsAt,
      priceCents: selected.priceCents,
      timeZone,
      currency,
    })

    setConfirmation(`${courtName} added to your booking.`)
    setSelected(null)
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-[family-name:var(--font-display)] text-[20px] font-bold tracking-[-0.02em]">
        Pick your time
      </h2>

      <SlotGrid
        slots={slots}
        timeZone={timeZone}
        currency={currency}
        selectedStartsAt={selected?.startsAt ?? null}
        onSelect={(slot) => {
          setSelected(slot)
          setConfirmation(null)
        }}
      />

      <button
        type="button"
        disabled={!selected}
        onClick={handleAdd}
        className="rounded-[10px] bg-navy px-4 py-3 text-[14px] font-bold text-white disabled:cursor-not-allowed disabled:bg-line-heavy disabled:text-muted"
      >
        {selected
          ? `Add to booking — ${formatMoney(selected.priceCents, currency)}`
          : 'Select a start time'}
      </button>

      {/* Announced rather than only shown, so the cart update is not silent. */}
      <p role="status" aria-live="polite" className="min-h-[20px] text-[13px] text-olive">
        {confirmation}
      </p>
    </section>
  )
}
