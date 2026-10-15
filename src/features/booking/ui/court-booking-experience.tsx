'use client'

import { useMemo, useState } from 'react'
import { SlotLegend, SlotPicker, type SlotStyle } from './slot-picker'
import { buildSlotRows, type SlotRow } from '../view/court-detail'
import { buildBookingQuote } from '../view/booking-quote'
import { useCart } from '@/features/cart/cart-provider'
import { formatMoney } from '@/lib/format/money'
import type { AvailabilitySlot } from '@/lib/services/availability'

/**
 * The booking half of the court detail page.
 *
 * The picker and the "Your booking" sidebar share one selection, so they live
 * behind a single client island rather than syncing two. Availability and
 * prices are computed on the server and passed down — nothing here fetches,
 * and nothing here re-prices a court.
 */

export type BookableAddon = {
  readonly id: string
  readonly name: string
  readonly description: string | null
  readonly priceCents: number
}

type CourtBookingExperienceProps = {
  readonly courtId: string
  readonly courtName: string
  readonly slots: readonly AvailabilitySlot[]
  readonly addons: readonly BookableAddon[]
  readonly durationMinutes: number
  readonly timeZone: string
  readonly currency: string
  readonly cancellationWindowHours: number
  readonly minPlayers: number
  readonly maxPlayers: number
  readonly includedPlayers: number
  readonly extraPlayerFeeCents: number
}

export function CourtBookingExperience({
  courtId,
  courtName,
  slots,
  addons,
  durationMinutes,
  timeZone,
  currency,
  cancellationWindowHours,
  minPlayers,
  maxPlayers,
  includedPlayers,
  extraPlayerFeeCents,
}: CourtBookingExperienceProps) {
  const { addCourt, setItemQuantity } = useCart()
  const [slotStyle, setSlotStyle] = useState<SlotStyle>('timeline')
  const [selected, setSelected] = useState<AvailabilitySlot | null>(null)
  const [chosenAddonIds, setChosenAddonIds] = useState<readonly string[]>([])
  const [confirmation, setConfirmation] = useState<string | null>(null)

  const rows = useMemo(
    () =>
      buildSlotRows({
        slots,
        selectedStartsAt: selected?.startsAt ?? null,
        durationMinutes,
        timeZone,
        currency,
      }),
    [slots, selected, durationMinutes, timeZone, currency],
  )

  const quote = buildBookingQuote({
    courtName,
    durationMinutes,
    courtPriceCents: selected?.priceCents ?? null,
    // Tier pricing is already folded into the quoted slot price by
    // `quoteCourtSegment`, and an anonymous visitor has no tier — so there is
    // no separate discount to name here without misrepresenting the price.
    discountCents: 0,
    addons: addons.map((addon) => ({
      productId: addon.id,
      name: addon.name,
      unitPriceCents: addon.priceCents,
      quantity: chosenAddonIds.includes(addon.id) ? 1 : 0,
    })),
    currency,
  })

  function handleSelect(row: SlotRow) {
    const match = slots.find((slot) => slot.startsAt.getTime() === row.startsAt.getTime())

    setSelected(match ?? null)
    setConfirmation(null)
  }

  function toggleAddon(id: string) {
    setChosenAddonIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    )
  }

  function handleAdd() {
    if (!selected) {
      return
    }

    addCourt({
      courtId,
      courtName,
      startsAt: selected.startsAt,
      endsAt: selected.endsAt,
      priceCents: selected.priceCents,
      timeZone,
      currency,
      minPlayers,
      maxPlayers,
      includedPlayers,
      extraPlayerFeeCents,
    })

    // Extras ride along as their own cart lines so the café and the desk see
    // one order rather than a court with hidden attachments.
    for (const addon of addons) {
      if (chosenAddonIds.includes(addon.id)) {
        setItemQuantity(
          {
            productId: addon.id,
            name: addon.name,
            unitPriceCents: addon.priceCents,
            quantity: 1,
            currency,
          },
          1,
        )
      }
    }

    setConfirmation(`${courtName} added to your booking.`)
    setSelected(null)
    setChosenAddonIds([])
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr] lg:items-start">
      <section
        aria-labelledby="pick-your-time"
        className="rounded-[18px] border border-line bg-surface p-5 sm:p-6"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2
            id="pick-your-time"
            className="font-[family-name:var(--font-display)] text-[20px] font-bold tracking-[-0.02em]"
          >
            Pick your time
          </h2>

          <div
            role="group"
            aria-label="Slot layout"
            className="flex flex-none gap-0.5 rounded-[9px] bg-canvas p-0.5"
          >
            {(['timeline', 'grid'] as const).map((style) => (
              <button
                key={style}
                type="button"
                aria-pressed={slotStyle === style}
                onClick={() => setSlotStyle(style)}
                className={`whitespace-nowrap rounded-[7px] px-3 py-2 text-[13px] font-bold ${
                  slotStyle === style ? 'bg-surface text-ink shadow-sm' : 'text-muted'
                }`}
              >
                {style === 'timeline' ? 'Timeline' : 'Start times'}
              </button>
            ))}
          </div>
        </div>

        <SlotPicker rows={rows} slotStyle={slotStyle} onSelect={handleSelect} />
        <SlotLegend />
      </section>

      <section
        aria-label="Your booking"
        className="flex flex-col gap-4 rounded-[18px] border border-line bg-surface p-5 sm:p-6 lg:sticky lg:top-[88px]"
      >
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-[18px] font-bold">
            Your booking
          </h2>
          <p className="mt-1 text-[14px] text-muted">
            {quote.hasCourt
              ? `${courtName} · ${rows.find((row) => row.state === 'selected')?.time ?? ''}`
              : 'Pick a start time to see your total.'}
          </p>
        </div>

        {addons.length > 0 ? (
          <div>
            <h3 className="text-[12px] font-bold uppercase tracking-[0.12em] text-olive">
              Add to your session
            </h3>
            <ul className="mt-3 flex flex-col gap-2">
              {addons.map((addon) => {
                const isChosen = chosenAddonIds.includes(addon.id)

                return (
                  <li key={addon.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isChosen}
                      onClick={() => toggleAddon(addon.id)}
                      className={`flex w-full items-center gap-3 rounded-[11px] border px-3.5 py-3 text-left ${
                        isChosen ? 'border-lime-deep bg-lime-soft' : 'border-line bg-surface'
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`grid h-5 w-5 flex-none place-items-center rounded-[6px] border text-[12px] font-bold ${
                          isChosen ? 'border-lime-deep bg-lime' : 'border-line-heavy bg-surface'
                        }`}
                      >
                        {isChosen ? '✓' : ''}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-semibold">{addon.name}</span>
                        {addon.description ? (
                          <span className="mt-px block text-[12.5px] text-muted">
                            {addon.description}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex-none text-[14px] font-bold tabular-nums">
                        {formatMoney(addon.priceCents, currency)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}

        <dl className="flex flex-col gap-2 border-t border-surface-sunken pt-4">
          {quote.lines.map((line) => (
            <div key={line.label} className="flex justify-between text-[14px] text-slate">
              <dt>{line.label}</dt>
              <dd className="tabular-nums">{line.value}</dd>
            </div>
          ))}
          <div className="mt-1.5 flex items-baseline justify-between border-t border-surface-sunken pt-3">
            <dt className="text-[15px] font-bold">Total</dt>
            <dd className="font-[family-name:var(--font-display)] text-[26px] font-bold tabular-nums">
              {quote.total}
            </dd>
          </div>
        </dl>

        <button
          type="button"
          disabled={!quote.hasCourt}
          onClick={handleAdd}
          className="rounded-[10px] bg-navy px-4 py-3 text-[14px] font-bold text-white disabled:cursor-not-allowed disabled:bg-line-heavy disabled:text-muted"
        >
          {quote.hasCourt ? `Add to booking — ${quote.total}` : 'Select a start time'}
        </button>

        <p className="text-center text-[12.5px] text-muted">
          Free cancellation up to {cancellationWindowHours} hours before
        </p>

        {/* Announced rather than only shown, so the cart update is not silent. */}
        <p role="status" aria-live="polite" className="min-h-[20px] text-[13px] text-olive">
          {confirmation}
        </p>
      </section>
    </div>
  )
}
