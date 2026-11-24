import { describe, expect, it } from 'vitest'
import { buildDateStrip, buildDurationOptions, buildSlotRows } from './court-detail'
import type { AvailabilitySlot } from '@/lib/services/availability'

const MANILA = 'Asia/Manila'

/**
 * The court detail view model. Everything the design's slot picker shows —
 * the date strip, the duration pills, and the per-row wording — is derived
 * here so the page component stays declarative and this logic stays testable
 * without a database or a DOM.
 */

describe('buildDateStrip', () => {
  it('starts at the selected day and runs for the requested number of days', () => {
    // Arrange / Act
    const strip = buildDateStrip({ selectedDay: '2026-08-04', timeZone: MANILA, days: 7 })

    // Assert — the design shows Tue 4 through Mon 10.
    expect(strip).toHaveLength(7)
    expect(strip[0]?.day).toBe('2026-08-04')
    expect(strip[6]?.day).toBe('2026-08-10')
  })

  it('labels each day with its club-local weekday and date number', () => {
    // Arrange / Act
    const [first] = buildDateStrip({ selectedDay: '2026-08-04', timeZone: MANILA, days: 7 })

    // Assert — 4 Aug 2026 is a Tuesday in Manila.
    expect(first?.weekday).toBe('Tue')
    expect(first?.dayOfMonth).toBe('4')
  })

  it('marks only the selected day as selected', () => {
    // Arrange / Act
    const strip = buildDateStrip({ selectedDay: '2026-08-04', timeZone: MANILA, days: 7 })

    // Assert
    expect(strip.filter((entry) => entry.isSelected)).toHaveLength(1)
    expect(strip[0]?.isSelected).toBe(true)
  })

  it('crosses a month boundary without producing an invalid day', () => {
    // Arrange — 30 Aug + 7 days runs into September.
    const strip = buildDateStrip({ selectedDay: '2026-08-30', timeZone: MANILA, days: 3 })

    // Assert
    expect(strip.map((entry) => entry.day)).toEqual(['2026-08-30', '2026-08-31', '2026-09-01'])
  })
})

describe('buildDurationOptions', () => {
  const club = { minDurationMinutes: 30, maxDurationMinutes: 240 }

  it('offers the four session lengths the design shows', () => {
    // Arrange / Act
    const options = buildDurationOptions({ club, durationMinutes: 60 })

    // Assert
    expect(options.map((option) => option.minutes)).toEqual([30, 60, 90, 120])
  })

  it('labels durations the way the design writes them', () => {
    // Arrange / Act
    const options = buildDurationOptions({ club, durationMinutes: 60 })

    // Assert
    expect(options.map((option) => option.label)).toEqual([
      '30 min',
      '1 hour',
      '1.5 hours',
      '2 hours',
    ])
  })

  it('marks the active duration', () => {
    // Arrange / Act
    const options = buildDurationOptions({ club, durationMinutes: 90 })

    // Assert
    expect(options.find((option) => option.isSelected)?.minutes).toBe(90)
  })

  it('drops lengths the club will not sell rather than offering a booking that fails', () => {
    // Arrange — a club with a one-hour minimum cannot take a 30 minute session.
    const options = buildDurationOptions({
      club: { minDurationMinutes: 60, maxDurationMinutes: 90 },
      durationMinutes: 60,
    })

    // Assert — getAvailability would reject 30 and 120, so neither is shown.
    expect(options.map((option) => option.minutes)).toEqual([60, 90])
  })
})

describe('buildSlotRows', () => {
  // 5:00 PM and 5:30 PM Manila on 4 Aug 2026 are 09:00 and 09:30 UTC.
  const at = (utc: string): Date => new Date(`2026-08-04T${utc}:00Z`)

  const slot = (utc: string, overrides: Partial<AvailabilitySlot> = {}): AvailabilitySlot => ({
    startsAt: at(utc),
    endsAt: at(utc),
    priceCents: 60000,
    isAvailable: true,
    isPast: false,
    ...overrides,
  })

  const base = {
    timeZone: MANILA,
    currency: 'PHP',
    durationMinutes: 60,
    selectedStartsAt: null,
  }

  it('renders each start time in club-local wording', () => {
    // Arrange / Act
    const [row] = buildSlotRows({ ...base, slots: [slot('09:00')] })

    // Assert
    expect(row?.time).toBe('5:00 PM')
  })

  it('prices an available slot and withholds a price for a taken one', () => {
    // Arrange / Act
    const rows = buildSlotRows({
      ...base,
      slots: [slot('09:00'), slot('09:30', { isAvailable: false })],
    })

    // Assert — the design shows an em dash rather than a price you cannot buy.
    expect(rows[0]?.price).toBe('₱600')
    expect(rows[1]?.price).toBe('—')
  })

  it('describes a taken slot as booked and refuses selection', () => {
    // Arrange / Act
    const [row] = buildSlotRows({ ...base, slots: [slot('09:00', { isAvailable: false })] })

    // Assert
    expect(row?.state).toBe('booked')
    expect(row?.label).toBe('Booked')
    expect(row?.isSelectable).toBe(false)
  })

  it('marks the chosen start time as the row the booking starts on', () => {
    // Arrange — a 60 minute booking starting 5:00 PM.
    const rows = buildSlotRows({
      ...base,
      slots: [slot('09:00'), slot('09:30')],
      selectedStartsAt: at('09:00'),
    })

    // Assert
    expect(rows[0]?.state).toBe('selected')
    expect(rows[0]?.label).toBe('Your slot starts here')
  })

  it('shows the rows a longer booking swallows as included rather than separately bookable', () => {
    // Arrange — 90 minutes from 5:00 PM covers the 5:30 and 6:00 rows.
    const rows = buildSlotRows({
      ...base,
      durationMinutes: 90,
      slots: [slot('09:00'), slot('09:30'), slot('10:00'), slot('10:30')],
      selectedStartsAt: at('09:00'),
    })

    // Assert
    expect(rows.map((row) => row.state)).toEqual(['selected', 'included', 'included', 'available'])
    expect(rows[1]?.label).toBe('Included in your booking')
  })

  it('leaves an unselected free slot available and selectable', () => {
    // Arrange / Act
    const [row] = buildSlotRows({ ...base, slots: [slot('09:00')] })

    // Assert
    expect(row?.state).toBe('available')
    expect(row?.label).toBe('Available')
    expect(row?.isSelectable).toBe(true)
  })

  it('flags a slot that is cheaper than the day rate as off-peak', () => {
    // Arrange — the 7:00 AM slot is priced below the 5:00 PM one.
    const rows = buildSlotRows({
      ...base,
      slots: [slot('09:00', { priceCents: 60000 }), slot('23:00', { priceCents: 45000 })],
    })

    // Assert — the design badges the cheaper rate rather than restating "Available".
    expect(rows[1]?.label).toBe('Off-peak rate')
  })
})
