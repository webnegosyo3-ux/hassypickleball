import { describe, expect, it } from 'vitest'
import { buildScheduleGrid } from './schedule'
import { club, DAY, makeBlock, makeBooking, makeCourt } from '../../../../test/admin-fixtures'

/**
 * The schedule grid is a pure projection: UTC instants in, percentage offsets
 * within the club's opening window out. Keeping the geometry here rather than
 * in the component is what makes the DST and clipping rules testable at all.
 */

const harbor = makeCourt({ id: 'court-1', name: 'Harbor Court' })
const maple = makeCourt({
  id: 'court-2',
  name: 'Maple Court',
  environment: 'outdoor',
  basePriceCents: 45_000,
})

/** An empty day on a single court — the baseline most cases vary from. */
function emptyGrid() {
  return buildScheduleGrid({ club, courts: [harbor], bookings: [], blocks: [], day: DAY })
}

describe('buildScheduleGrid', () => {
  it('labels one row per opening hour, from opening to the last hour before close', () => {
    // Arrange — the club opens 07:00 and closes 22:00.
    // Act
    const grid = emptyGrid()

    // Assert
    expect(grid.hourLabels).toHaveLength(15)
    expect(grid.hourLabels[0]).toBe('7:00 AM')
    expect(grid.hourLabels.at(-1)).toBe('9:00 PM')
  })

  it('renders one column per court, carrying the name and rate the design shows', () => {
    // Act
    const grid = buildScheduleGrid({
      club,
      courts: [harbor, maple],
      bookings: [],
      blocks: [],
      day: DAY,
    })

    // Assert
    expect(grid.columns.map((column) => column.courtName)).toEqual(['Harbor Court', 'Maple Court'])
    expect(grid.columns[1].meta).toBe('Outdoor · ₱450/hr')
  })

  it('positions a booking as a percentage of the opening window', () => {
    // Arrange — 10:00–11:30 inside an 07:00–22:00 (900 minute) window.
    const bookings = [
      makeBooking({ segments: [{ courtId: harbor.id, from: '10:00', to: '11:30' }] }),
    ]

    // Act
    const [column] = buildScheduleGrid({
      club,
      courts: [harbor],
      bookings,
      blocks: [],
      day: DAY,
    }).columns

    // Assert — starts 180 min in (20%), runs 90 min (10%).
    expect(column.entries).toHaveLength(1)
    expect(column.entries[0].topPercent).toBeCloseTo(20, 5)
    expect(column.entries[0].heightPercent).toBeCloseTo(10, 5)
  })

  it('titles a booking with the customer and its club-local time range', () => {
    // Arrange
    const bookings = [
      makeBooking({
        contactName: 'Jun Park',
        segments: [{ courtId: harbor.id, from: '17:00', to: '18:30' }],
      }),
    ]

    // Act
    const [column] = buildScheduleGrid({
      club,
      courts: [harbor],
      bookings,
      blocks: [],
      day: DAY,
    }).columns

    // Assert
    expect(column.entries[0].title).toBe('Jun Park')
    expect(column.entries[0].detail).toBe('5:00 PM – 6:30 PM')
  })

  it('tones entries so confirmed, unpaid, blocked, and league time read differently', () => {
    // Arrange
    const bookings = [
      makeBooking({
        id: 'b1',
        status: 'confirmed',
        segments: [{ courtId: harbor.id, from: '08:00', to: '09:00' }],
      }),
      makeBooking({
        id: 'b2',
        status: 'awaiting_payment',
        segments: [{ courtId: harbor.id, from: '09:00', to: '10:00' }],
      }),
    ]
    const blocks = [
      makeBlock({ id: 'k1', courtId: harbor.id, kind: 'maintenance', from: '11:00', to: '12:00' }),
      makeBlock({ id: 'k2', courtId: harbor.id, kind: 'league', from: '13:00', to: '14:00' }),
    ]

    // Act
    const [column] = buildScheduleGrid({
      club,
      courts: [harbor],
      bookings,
      blocks,
      day: DAY,
    }).columns

    // Assert
    expect(column.entries.map((entry) => entry.tone)).toEqual([
      'confirmed',
      'awaiting',
      'blocked',
      'event',
    ])
  })

  it('names a block by its reason, falling back to the kind when there is none', () => {
    // Arrange
    const blocks = [
      makeBlock({
        id: 'k1',
        courtId: harbor.id,
        kind: 'maintenance',
        reason: 'Net replacement',
        from: '11:00',
        to: '12:00',
      }),
      makeBlock({ id: 'k2', courtId: harbor.id, kind: 'closed', from: '12:00', to: '13:00' }),
    ]

    // Act
    const [column] = buildScheduleGrid({
      club,
      courts: [harbor],
      bookings: [],
      blocks,
      day: DAY,
    }).columns

    // Assert
    expect(column.entries.map((entry) => entry.title)).toEqual(['Net replacement', 'Closed'])
  })

  it('leaves a cancelled booking off the grid so its court reads as free', () => {
    // Arrange
    const bookings = [
      makeBooking({
        status: 'cancelled',
        segments: [{ courtId: harbor.id, from: '10:00', to: '11:00' }],
      }),
    ]

    // Act
    const [column] = buildScheduleGrid({
      club,
      courts: [harbor],
      bookings,
      blocks: [],
      day: DAY,
    }).columns

    // Assert
    expect(column.entries).toEqual([])
  })

  it('keeps each entry in its own court column', () => {
    // Arrange
    const bookings = [
      makeBooking({
        id: 'b1',
        segments: [{ courtId: maple.id, courtName: 'Maple Court', from: '10:00', to: '11:00' }],
      }),
    ]

    // Act
    const grid = buildScheduleGrid({
      club,
      courts: [harbor, maple],
      bookings,
      blocks: [],
      day: DAY,
    })

    // Assert
    expect(grid.columns[0].entries).toEqual([])
    expect(grid.columns[1].entries).toHaveLength(1)
  })

  it('clips an entry that starts before opening so it cannot overflow the grid', () => {
    // Arrange — an overnight block running from 05:00 to 09:00.
    const blocks = [makeBlock({ courtId: harbor.id, kind: 'closed', from: '05:00', to: '09:00' })]

    // Act
    const [entry] = buildScheduleGrid({
      club,
      courts: [harbor],
      bookings: [],
      blocks,
      day: DAY,
    }).columns[0].entries

    // Assert — visible portion is 07:00–09:00: the top of the grid, 2 of 15 hours.
    expect(entry.topPercent).toBe(0)
    expect(entry.heightPercent).toBeCloseTo((120 / 900) * 100, 5)
  })

  it('clips an entry that runs past closing to the bottom of the grid', () => {
    // Arrange
    const blocks = [makeBlock({ courtId: harbor.id, kind: 'closed', from: '21:00', to: '23:30' })]

    // Act
    const [entry] = buildScheduleGrid({
      club,
      courts: [harbor],
      bookings: [],
      blocks,
      day: DAY,
    }).columns[0].entries

    // Assert
    expect(entry.topPercent + entry.heightPercent).toBeCloseTo(100, 5)
  })

  it('drops anything that falls entirely outside the opening window', () => {
    // Arrange — a 23:00–23:59 closure on a club that shuts at 22:00.
    const blocks = [makeBlock({ courtId: harbor.id, kind: 'closed', from: '23:00', to: '23:59' })]

    // Act
    const [column] = buildScheduleGrid({
      club,
      courts: [harbor],
      bookings: [],
      blocks,
      day: DAY,
    }).columns

    // Assert
    expect(column.entries).toEqual([])
  })

  it('orders entries by start time regardless of the order they arrive in', () => {
    // Arrange
    const bookings = [
      makeBooking({
        id: 'late',
        contactName: 'Later',
        segments: [{ courtId: harbor.id, from: '18:00', to: '19:00' }],
      }),
      makeBooking({
        id: 'early',
        contactName: 'Earlier',
        segments: [{ courtId: harbor.id, from: '08:00', to: '09:00' }],
      }),
    ]

    // Act
    const [column] = buildScheduleGrid({
      club,
      courts: [harbor],
      bookings,
      blocks: [],
      day: DAY,
    }).columns

    // Assert
    expect(column.entries.map((entry) => entry.title)).toEqual(['Earlier', 'Later'])
  })
})

describe('buildScheduleGrid availability', () => {
  it('reports a court with nothing on it as open for the whole day', () => {
    // Act
    const grid = emptyGrid()

    // Assert — the club opens 07:00 and closes 22:00.
    expect(grid.columns[0].openMinutes).toBe(900)
    expect(grid.columns[0].openLabel).toBe('15 hrs open')
  })

  it('takes booked and blocked time off the open total', () => {
    // Arrange — 90 minutes booked, 60 minutes blocked.
    const grid = buildScheduleGrid({
      club,
      courts: [harbor],
      bookings: [makeBooking({ segments: [{ courtId: harbor.id, from: '17:00', to: '18:30' }] })],
      blocks: [makeBlock({ courtId: harbor.id, kind: 'maintenance', from: '09:00', to: '10:00' })],
      day: DAY,
    })

    // Assert
    expect(grid.columns[0].openMinutes).toBe(750)
    expect(grid.columns[0].openLabel).toBe('12.5 hrs open')
  })

  it('counts overlapping holds once so open time can never go negative', () => {
    // Arrange — a block sitting inside a longer booking on the same court.
    const grid = buildScheduleGrid({
      club,
      courts: [harbor],
      bookings: [makeBooking({ segments: [{ courtId: harbor.id, from: '09:00', to: '12:00' }] })],
      blocks: [makeBlock({ courtId: harbor.id, kind: 'closed', from: '10:00', to: '11:00' })],
      day: DAY,
    })

    // Assert
    expect(grid.columns[0].openMinutes).toBe(720)
  })

  it('says a fully held court is fully booked rather than "0 hrs open"', () => {
    // Arrange
    const grid = buildScheduleGrid({
      club,
      courts: [harbor],
      bookings: [],
      blocks: [makeBlock({ courtId: harbor.id, kind: 'closed', from: '07:00', to: '22:00' })],
      day: DAY,
    })

    // Assert
    expect(grid.columns[0].openMinutes).toBe(0)
    expect(grid.columns[0].openLabel).toBe('Fully booked')
  })

  it('ignores a cancelled booking, whose court time is open again', () => {
    // Arrange
    const grid = buildScheduleGrid({
      club,
      courts: [harbor],
      bookings: [
        makeBooking({
          status: 'cancelled',
          segments: [{ courtId: harbor.id, from: '17:00', to: '18:30' }],
        }),
      ],
      blocks: [],
      day: DAY,
    })

    // Assert
    expect(grid.columns[0].openMinutes).toBe(900)
  })
})

describe('buildScheduleGrid summary', () => {
  it('says a court with nothing on it is not booked', () => {
    // Act
    const grid = emptyGrid()

    // Assert
    expect(grid.columns[0].summary).toBe('Nothing booked')
  })

  it('counts the bookings holding a court', () => {
    // Arrange
    const bookings = [
      makeBooking({
        id: 'b1',
        contactName: 'Maya',
        segments: [{ courtId: harbor.id, from: '08:00', to: '09:00' }],
      }),
      makeBooking({
        id: 'b2',
        contactName: 'Jun',
        segments: [{ courtId: harbor.id, from: '10:00', to: '11:00' }],
      }),
    ]

    // Act
    const [column] = buildScheduleGrid({
      club,
      courts: [harbor],
      bookings,
      blocks: [],
      day: DAY,
    }).columns

    // Assert
    expect(column.summary).toBe('2 bookings')
  })

  it('tells a staff hold apart from a booking, one of each reading singular', () => {
    // Arrange
    const bookings = [
      makeBooking({ segments: [{ courtId: harbor.id, from: '10:00', to: '11:00' }] }),
    ]
    const blocks = [makeBlock({ courtId: harbor.id, kind: 'closed', from: '12:00', to: '13:00' })]

    // Act
    const [column] = buildScheduleGrid({
      club,
      courts: [harbor],
      bookings,
      blocks,
      day: DAY,
    }).columns

    // Assert
    expect(column.summary).toBe('1 booking · 1 hold')
  })

  it('says nothing is booked rather than counting a cancelled booking', () => {
    // Arrange
    const bookings = [
      makeBooking({
        status: 'cancelled',
        segments: [{ courtId: harbor.id, from: '10:00', to: '11:00' }],
      }),
    ]

    // Act
    const [column] = buildScheduleGrid({
      club,
      courts: [harbor],
      bookings,
      blocks: [],
      day: DAY,
    }).columns

    // Assert
    expect(column.summary).toBe('Nothing booked')
  })
})

describe('buildScheduleGrid releasable entries', () => {
  it('carries the block id so the screen can offer to release it', () => {
    // Arrange
    const grid = buildScheduleGrid({
      club,
      courts: [harbor],
      bookings: [],
      blocks: [
        makeBlock({
          id: 'block-7',
          courtId: harbor.id,
          kind: 'maintenance',
          reason: 'Net repair',
          from: '09:00',
          to: '10:00',
        }),
      ],
      day: DAY,
    })

    // Assert
    expect(grid.columns[0].entries[0].blockId).toBe('block-7')
  })

  it('leaves a booking with no block id — a booking is cancelled, not released', () => {
    // Arrange
    const grid = buildScheduleGrid({
      club,
      courts: [harbor],
      bookings: [makeBooking({ segments: [{ courtId: harbor.id, from: '17:00', to: '18:30' }] })],
      blocks: [],
      day: DAY,
    })

    // Assert
    expect(grid.columns[0].entries[0].blockId).toBeNull()
  })
})
