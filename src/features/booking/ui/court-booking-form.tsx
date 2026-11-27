'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import type { FormEvent } from 'react'
import { MonthDayPicker } from './month-day-picker'
import { useBookingStage } from './booking-stage'
import {
  buildBookingFormOrder,
  buildBookingFormSummary,
  formatAddonPrice,
  type BookableAddon,
  type BookingFormContact,
} from '../view/booking-form'
import { buildSlotRows } from '../view/court-detail'
import { monthOf } from '../view/month-calendar'
import { parseAvailabilityPayload, toSlot, type SerialisedSlot } from '../view/availability-payload'
import { CheckoutThankYou } from '@/features/checkout/ui/checkout-thank-you'
import { PaymentMethodPicker } from '@/features/checkout/ui/payment-method-picker'
import type { CheckoutPaymentMethod } from '@/features/checkout/view/payment-method'
import type { CheckoutResult } from '@/features/checkout/server/submit-checkout'
import type { Result } from '@/lib/api/result'
import { isPartySizeAllowed } from '@/lib/domain/pax'
import { PROOF_ACCEPT_ATTRIBUTE, validatePaymentProof } from '@/lib/domain/payment-proof'
import { formatTimeInZone } from '@/lib/format/time'

/**
 * The booking form.
 *
 * Fill in who is playing, pick a day and a start time, tick whatever extras
 * they want, and pay — all on the court's own page. There is no cart and no
 * checkout step: the customer's choices stay on screen until they confirm.
 *
 * The calendar is driven from the browser because the form cannot survive a
 * navigation: every day or month change would drop what has been typed. The
 * availability itself still comes from the server, never guessed here — a slot
 * is only offered once `/api/availability` has said it is open.
 */

export type CourtBookingFormProps = {
  readonly clubId: string
  readonly courtId: string
  readonly courtName: string
  readonly currency: string
  readonly timeZone: string
  readonly cancellationWindowHours: number
  readonly capacity: {
    readonly minPlayers: number
    readonly includedPlayers: number
    readonly maxPlayers: number
    readonly extraPlayerFeeCents: number
  }
  readonly durations: ReadonlyArray<{ readonly minutes: number; readonly label: string }>
  /** Club-local today, "YYYY-MM-DD". */
  readonly today: string
  /** Club-local day the page was rendered for, "YYYY-MM-DD". */
  readonly initialDay: string
  readonly initialDuration: number
  readonly initialSlots: readonly SerialisedSlot[]
  readonly initialOpenByDay: Readonly<Record<string, number>>
  /** A slot a customer arrived with, already chosen for them. */
  readonly preselectedAt: string | null
  readonly addons: readonly BookableAddon[]
  readonly paymentMethods: readonly CheckoutPaymentMethod[]
  readonly onSubmit: (form: FormData) => Promise<Result<CheckoutResult>>
}

const EMPTY_CONTACT: BookingFormContact = {
  contactName: '',
  contactPhone: '',
  notes: '',
  willPresentId: false,
}

const PROOF_INPUT_ID = 'booking-proof'
const PROOF_HINT_ID = 'booking-proof-hint'

function dayLabel(day: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${day}T12:00:00Z`))
}

function Field({
  label,
  name,
  type = 'text',
  value,
  required,
  autoComplete,
  onChange,
}: {
  readonly label: string
  readonly name: string
  readonly type?: string
  readonly value: string
  readonly required?: boolean
  readonly autoComplete?: string
  readonly onChange: (value: string) => void
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-slate">{label}</span>
      <input
        name={name}
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-[10px] border border-line bg-surface px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-lime-deep"
      />
    </label>
  )
}

export function CourtBookingForm({
  clubId,
  courtId,
  courtName,
  currency,
  timeZone,
  cancellationWindowHours,
  capacity,
  durations,
  today,
  initialDay,
  initialDuration,
  initialSlots,
  initialOpenByDay,
  preselectedAt,
  addons,
  paymentMethods,
  onSubmit,
}: CourtBookingFormProps) {
  const [contact, setContact] = useState<BookingFormContact>(EMPTY_CONTACT)
  const [players, setPlayers] = useState<readonly string[]>([])
  const [addonIds, setAddonIds] = useState<readonly string[]>([])
  const [methodId, setMethodId] = useState<string | null>(paymentMethods[0]?.id ?? null)
  const [proof, setProof] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CheckoutResult | null>(null)
  const [isPending, startTransition] = useTransition()
  const stage = useBookingStage()

  const [day, setDay] = useState(initialDay)
  const [month, setMonth] = useState(monthOf(initialDay))
  const [duration, setDuration] = useState(initialDuration)
  const [slots, setSlots] = useState<readonly SerialisedSlot[]>(initialSlots)
  const [openByDay, setOpenByDay] = useState<Readonly<Record<string, number>>>(initialOpenByDay)
  const [selectedAt, setSelectedAt] = useState<string | null>(preselectedAt)
  const [loadError, setLoadError] = useState<string | null>(null)

  const proofRef = useRef<HTMLInputElement>(null)
  // A fast tapper can have two requests in flight; only the newest may win.
  const latestRequest = useRef(0)

  // The day, length and month the times on screen actually belong to. The
  // server answered for the opening one, so it starts settled — reading it
  // again would duplicate the page's own request.
  const initialKey = `${initialDay}|${initialDuration}|${monthOf(initialDay)}`
  const requestKey = `${day}|${duration}|${month}`
  const [settledKey, setSettledKey] = useState(initialKey)
  const isFetching = requestKey !== settledKey

  useEffect(() => {
    if (requestKey === settledKey) {
      return
    }

    const request = latestRequest.current + 1
    latestRequest.current = request
    const controller = new AbortController()

    const params = new URLSearchParams({
      courtId,
      day,
      month,
      duration: String(duration),
    })

    fetch(`/api/availability?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => parseAvailabilityPayload(await response.json()))
      .then((payload) => {
        if (controller.signal.aborted || latestRequest.current !== request) {
          return
        }

        if (!payload) {
          setSlots([])
          setLoadError('Times could not be loaded. Please try another day.')
          return
        }

        // Only the answer for what is on screen may be shown: a late reply for
        // yesterday's day must not overwrite today's.
        if (payload.day === day) {
          setSlots(payload.slots)
          setLoadError(payload.error)
        }

        if (payload.month === month && payload.days) {
          setOpenByDay(payload.days)
        }
      })
      .catch(() => {
        if (controller.signal.aborted || latestRequest.current !== request) {
          return
        }

        setSlots([])
        setLoadError('Times could not be loaded. Check your connection and try again.')
      })
      .finally(() => {
        if (!controller.signal.aborted && latestRequest.current === request) {
          setSettledKey(requestKey)
        }
      })

    return () => controller.abort()
  }, [courtId, day, month, duration, requestKey, settledKey])

  const slotList = useMemo(() => slots.map(toSlot), [slots])
  // Nothing on screen may describe a day whose times have not arrived yet.
  const visibleSlots = isFetching ? [] : slotList
  const selectedSlot =
    visibleSlots.find((slot) => slot.startsAt.toISOString() === selectedAt && slot.isAvailable) ??
    null

  const rows = buildSlotRows({
    slots: visibleSlots,
    selectedStartsAt: selectedSlot?.startsAt ?? null,
    durationMinutes: duration,
    timeZone,
    currency,
  })

  const namedPlayers = players.map((player) => player.trim()).filter((player) => player.length > 0)
  const method = paymentMethods.find((entry) => entry.id === methodId) ?? null
  const openCount = visibleSlots.filter((slot) => slot.isAvailable).length

  const summary = buildBookingFormSummary({
    courtName,
    durationMinutes: duration,
    slotPriceCents: selectedSlot?.priceCents ?? null,
    addons,
    addonIds,
    partySize: namedPlayers.length,
    band: capacity,
    currency,
  })

  if (result) {
    return <CheckoutThankYou result={result} currency={currency} />
  }

  function setField(field: keyof BookingFormContact) {
    return (value: string) => setContact((current) => ({ ...current, [field]: value }))
  }

  function selectDay(next: string) {
    setDay(next)
    // The chosen start time belongs to the day it was picked on.
    setSelectedAt(null)
    setError(null)
  }

  function selectDuration(minutes: number) {
    setDuration(minutes)
    // The old window ends at a different time, so the selection no longer holds.
    setSelectedAt(null)
    setError(null)
  }

  function toggleAddon(id: string) {
    setAddonIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    )
  }

  /** Returns the reason this cannot be sent, or null if it can. */
  function findLocalProblem(): string | null {
    if (!selectedSlot) {
      return 'Pick a date and an available start time'
    }

    if (namedPlayers.length > 0 && !isPartySizeAllowed(namedPlayers.length, capacity)) {
      return `This court seats ${capacity.minPlayers}–${capacity.maxPlayers} players`
    }

    if (!method) {
      return 'Please choose how you would like to pay'
    }

    if (!proof) {
      return method.requiresProof
        ? `Please attach a screenshot of your ${method.label} payment`
        : null
    }

    const validated = validatePaymentProof(proof)

    return validated.success ? null : validated.error
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const problem = findLocalProblem()

    if (problem) {
      setError(problem)
      return
    }

    const order = buildBookingFormOrder({
      clubId,
      courtId,
      slot: selectedSlot,
      contact,
      addonIds,
      players,
      paymentMethodId: methodId,
    })

    if (!order) {
      setError('Something went wrong with that booking. Please try again.')
      return
    }

    setError(null)

    const form = new FormData()
    form.set('order', JSON.stringify(order))

    if (proof) {
      form.set('proof', proof)
    }

    startTransition(async () => {
      const outcome = await onSubmit(form)

      if (!outcome.success) {
        // Everything typed is left alone on purpose: a slot conflict or a rate
        // limit is something the customer can act on.
        setError(outcome.error)
        return
      }

      // The court's summary card above this form has nothing left to sell now
      // that the court is held, so the page takes it away.
      stage.markBooked()
      setResult(outcome.data)
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start"
    >
      <div className="flex flex-col gap-5">
        <section
          aria-labelledby="your-details"
          className="rounded-[18px] border border-line bg-surface p-5 sm:p-6"
        >
          <h2
            id="your-details"
            className="text-center font-[family-name:var(--font-display)] text-[20px] font-bold tracking-[-0.02em]"
          >
            Your details
          </h2>

          <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
            <Field
              label="Full name"
              name="contactName"
              value={contact.contactName}
              required
              autoComplete="name"
              onChange={setField('contactName')}
            />
            <Field
              label="Phone number"
              name="contactPhone"
              type="tel"
              value={contact.contactPhone}
              required
              autoComplete="tel"
              onChange={setField('contactPhone')}
            />
            <div className="sm:col-span-2">
              <Field
                label="Anything we should know? (optional)"
                name="notes"
                value={contact.notes}
                onChange={setField('notes')}
              />
            </div>
            <label className="flex items-start gap-2.5 sm:col-span-2">
              <input
                type="checkbox"
                checked={contact.willPresentId}
                onChange={(event) =>
                  setContact((current) => ({ ...current, willPresentId: event.target.checked }))
                }
                className="mt-0.5 size-4 flex-none accent-navy"
              />
              <span className="text-[13.5px] text-slate">
                I will present a valid ID at the desk when I arrive.
              </span>
            </label>
          </div>
        </section>

        <section
          aria-labelledby="players"
          className="rounded-[18px] border border-line bg-surface p-5 sm:p-6"
        >
          <div className="text-center">
            <h2
              id="players"
              className="font-[family-name:var(--font-display)] text-[20px] font-bold tracking-[-0.02em]"
            >
              Players
            </h2>
            <p className="mt-1 text-[13px] font-semibold text-muted">
              Up to {capacity.maxPlayers} players
            </p>
          </div>
          <p className="mt-1 text-center text-pretty text-[13px] text-muted">
            Add the names of everyone playing. The slot covers {capacity.includedPlayers}; each
            player beyond that adds{' '}
            {formatAddonPrice(
              {
                id: 'extra',
                name: 'extra player',
                description: null,
                priceCents: capacity.extraPlayerFeeCents,
              },
              currency,
            )}
            .
          </p>

          {players.length > 0 ? (
            <div className="mt-4 flex flex-col gap-2.5">
              {players.map((player, index) => (
                <div key={index} className="flex items-end gap-2">
                  <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="text-[13px] font-semibold text-slate">
                      Player {index + 1} name
                    </span>
                    <input
                      value={player}
                      autoComplete="off"
                      onChange={(event) =>
                        setPlayers((current) =>
                          current.map((name, position) =>
                            position === index ? event.target.value : name,
                          ),
                        )
                      }
                      className="rounded-[10px] border border-line bg-surface px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-lime-deep"
                    />
                  </label>
                  <button
                    type="button"
                    aria-label={`Remove player ${index + 1}`}
                    onClick={() =>
                      setPlayers((current) => current.filter((_, position) => position !== index))
                    }
                    className="rounded-[9px] border border-line px-3 py-2.5 text-[13px] font-semibold text-muted hover:text-danger"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {players.length < capacity.maxPlayers ? (
            <button
              type="button"
              onClick={() => setPlayers((current) => [...current, ''])}
              className="mt-4 w-full rounded-[9px] border border-navy px-3.5 py-2.5 text-[13px] font-bold text-navy sm:w-auto"
            >
              + Add player
            </button>
          ) : null}
        </section>

        <section
          aria-labelledby="pick-your-time"
          className="rounded-[18px] border border-line bg-surface p-5 sm:p-6"
        >
          <div className="text-center">
            <h2
              id="pick-your-time"
              className="font-[family-name:var(--font-display)] text-[20px] font-bold tracking-[-0.02em]"
            >
              Pick your date and time
            </h2>
            <p className="mt-1 text-[13px] text-muted">
              Days still free are green. Times already taken are marked, so you only pick from what
              is really open.
            </p>
          </div>

          <div
            role="group"
            aria-label="Session length"
            className="mt-4 flex flex-wrap items-center justify-center gap-2"
          >
            <span className="mr-1 text-[13px] font-medium text-muted">Session length</span>
            {durations.map((option) => (
              <button
                key={option.minutes}
                type="button"
                aria-pressed={option.minutes === duration}
                onClick={() => selectDuration(option.minutes)}
                className={`flex min-h-[44px] items-center rounded-[9px] border px-3.5 text-[13.5px] font-semibold ${
                  option.minutes === duration
                    ? 'border-navy bg-navy text-white'
                    : 'border-line bg-surface text-slate hover:border-line-heavy'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] lg:items-start">
            <MonthDayPicker
              month={month}
              timeZone={timeZone}
              today={today}
              selectedDay={day}
              openByDay={openByDay}
              isBusy={isFetching}
              onSelect={selectDay}
              onMonthChange={setMonth}
            />

            <div aria-busy={isFetching}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <p className="m-0 text-[13.5px] font-bold">{dayLabel(day, timeZone)}</p>
                <p className="m-0 text-[12.5px] font-semibold text-olive">
                  {isFetching
                    ? 'Loading times…'
                    : openCount === 0
                      ? 'Nothing left this day'
                      : `${openCount} start times free`}
                </p>
              </div>

              {!isFetching && loadError ? (
                <p
                  role="alert"
                  className="mb-2 rounded-[12px] border border-danger-line bg-danger-bg px-3.5 py-2.5 text-[13px] text-danger"
                >
                  {loadError}
                </p>
              ) : null}

              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {rows.map((row) => (
                  <li key={row.startsAt.toISOString()}>
                    <button
                      type="button"
                      disabled={!row.isSelectable}
                      aria-pressed={row.state === 'selected'}
                      aria-label={`${row.time}, ${row.label}${row.state === 'available' ? `, ${row.price}` : ''}`}
                      onClick={() => {
                        setSelectedAt(row.startsAt.toISOString())
                        setError(null)
                      }}
                      className={`flex min-h-[54px] w-full flex-col items-center justify-center rounded-[10px] border px-1 py-1.5 text-center transition ${
                        row.state === 'selected'
                          ? 'border-navy bg-navy text-white'
                          : row.isSelectable
                            ? 'border-lime-deep bg-lime-soft text-navy hover:border-navy hover:bg-lime'
                            : 'border-line bg-surface-sunken text-subtle'
                      }`}
                    >
                      <span
                        className={`text-[13px] font-bold leading-none ${
                          row.isSelectable ? '' : 'line-through decoration-1'
                        }`}
                      >
                        {row.time}
                      </span>
                      <span className="mt-1 text-[10px] font-bold uppercase leading-none tracking-[0.04em]">
                        {row.state === 'available' || row.state === 'selected'
                          ? row.price
                          : row.label}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              {rows.length === 0 && !isFetching && loadError === null ? (
                <p className="rounded-[12px] border border-line bg-surface-sunken px-3.5 py-4 text-center text-[13px] text-muted">
                  This court has no start times for the length you picked. Try another session
                  length or day.
                </p>
              ) : null}
            </div>
          </div>
        </section>

        {addons.length > 0 ? (
          <section
            aria-labelledby="extras"
            className="rounded-[18px] border border-line bg-surface p-5 sm:p-6"
          >
            <h2
              id="extras"
              className="text-center font-[family-name:var(--font-display)] text-[20px] font-bold tracking-[-0.02em]"
            >
              Optional extras
            </h2>
            <p className="mt-1 text-center text-[13px] text-muted">
              Add anything you want ready when you arrive.
            </p>

            <ul className="mt-4 flex flex-col gap-2">
              {addons.map((addon) => {
                const isChosen = addonIds.includes(addon.id)

                return (
                  <li key={addon.id}>
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-[11px] border px-3.5 py-3 ${
                        isChosen ? 'border-lime-deep bg-lime-soft' : 'border-line bg-surface'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChosen}
                        onChange={() => toggleAddon(addon.id)}
                        className="size-4 flex-none accent-navy"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-semibold">{addon.name}</span>
                        {addon.description ? (
                          <span className="mt-px block text-[12.5px] text-muted">
                            {addon.description}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex-none text-[14px] font-bold tabular-nums">
                        {formatAddonPrice(addon, currency)}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}

        <section
          aria-labelledby="payment"
          className="rounded-[18px] border border-line bg-surface p-5 sm:p-6"
        >
          <h2
            id="payment"
            className="text-center font-[family-name:var(--font-display)] text-[20px] font-bold tracking-[-0.02em]"
          >
            Payment
          </h2>

          {paymentMethods.length === 0 ? (
            <p className="mt-3 rounded-[12px] border border-line bg-surface-sunken px-4 py-3 text-[13.5px] text-muted">
              Online booking is paused while we update our payment details. Please call the club to
              reserve a court.
            </p>
          ) : (
            <div className="mt-4">
              <PaymentMethodPicker
                methods={paymentMethods}
                selectedId={methodId}
                onSelect={(id) => {
                  setMethodId(id)
                  // The old file belongs to the old method's instructions.
                  setProof(null)
                  setError(null)

                  if (proofRef.current) {
                    proofRef.current.value = ''
                  }
                }}
              />
            </div>
          )}

          {method?.requiresProof ? (
            <div className="mt-5 flex flex-col gap-1.5">
              <label htmlFor={PROOF_INPUT_ID} className="text-[13px] font-semibold text-slate">
                Screenshot of your payment
              </label>
              <input
                id={PROOF_INPUT_ID}
                ref={proofRef}
                type="file"
                name="proof"
                accept={PROOF_ACCEPT_ATTRIBUTE}
                aria-describedby={PROOF_HINT_ID}
                onChange={(event) => {
                  setProof(event.target.files?.[0] ?? null)
                  setError(null)
                }}
                className="rounded-[10px] border border-dashed border-line-heavy bg-canvas px-3.5 py-3 text-[13.5px] text-slate file:mr-3 file:rounded-[7px] file:border-0 file:bg-navy file:px-3 file:py-1.5 file:text-[13px] file:font-bold file:text-white"
              />
              <p id={PROOF_HINT_ID} className="text-[12.5px] text-muted">
                A JPG, PNG, or phone screenshot up to 5 MB.
              </p>
            </div>
          ) : null}
        </section>
      </div>

      <section
        aria-label="Booking summary"
        className="flex flex-col gap-4 rounded-[18px] border border-line bg-surface p-5 sm:p-6 lg:sticky lg:top-[88px]"
      >
        <div className="text-center">
          <h2 className="font-[family-name:var(--font-display)] text-[18px] font-bold">
            Your booking
          </h2>
          <p className="mt-1 text-[13.5px] text-muted">
            {selectedSlot
              ? `${courtName} · ${dayLabel(day, timeZone)} · ${formatTimeInZone(
                  selectedSlot.startsAt,
                  timeZone,
                )}`
              : 'Pick a date and an available start time.'}
          </p>
        </div>

        <dl className="flex flex-col gap-2 border-t border-surface-sunken pt-4">
          {summary.lines.length > 0 ? (
            summary.lines.map((line) => (
              <div key={line.label} className="flex justify-between text-[14px] text-slate">
                <dt>{line.label}</dt>
                <dd className="tabular-nums">{line.value}</dd>
              </div>
            ))
          ) : (
            <div className="flex justify-between text-[14px] text-muted">
              <dt>Session</dt>
              <dd>—</dd>
            </div>
          )}
          <div className="mt-1.5 flex items-baseline justify-between border-t border-surface-sunken pt-3">
            <dt className="text-[15px] font-bold">Total</dt>
            <dd className="font-[family-name:var(--font-display)] text-[26px] font-bold tabular-nums">
              {summary.total}
            </dd>
          </div>
        </dl>

        <button
          type="submit"
          disabled={isPending || !summary.hasSlot || paymentMethods.length === 0}
          className="w-full rounded-[10px] bg-navy px-4 py-3.5 text-[14px] font-bold text-white disabled:cursor-not-allowed disabled:bg-line-heavy disabled:text-muted"
        >
          {isPending
            ? 'Confirming…'
            : summary.hasSlot
              ? `Confirm booking — ${summary.total}`
              : 'Pick a date and time'}
        </button>

        {error ? (
          <p role="alert" className="text-[13px] font-semibold text-danger">
            {error}
          </p>
        ) : null}

        <p className="text-center text-[12.5px] text-muted">
          Your court is held while we verify your payment. Free cancellation up to{' '}
          {cancellationWindowHours} hours before.
        </p>
      </section>
    </form>
  )
}
