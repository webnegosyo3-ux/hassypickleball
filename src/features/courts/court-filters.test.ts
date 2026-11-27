import { describe, expect, it } from 'vitest'
import {
  buildCatalogHref,
  COURT_FILTERS,
  filterCourts,
  isCourtFilterId,
  parseCourtFilter,
} from './court-filters'
import type { Court } from '@/lib/repositories/mappers'

function court(overrides: Partial<Court> = {}): Court {
  return {
    id: 'court-1',
    clubId: 'club-1',
    name: 'Court 1',
    slug: 'court-1',
    surface: 'Cushioned acrylic',
    environment: 'indoor',
    isTournamentGrade: false,
    blurb: null,
    notes: [],
    tags: [],
    includes: [],
    heroImageUrl: null,
    basePriceCents: 60000,
    sortOrder: 1,
    isActive: true,
    minPlayers: 2,
    maxPlayers: 4,
    includedPlayers: 4,
    extraPlayerFeeCents: 0,
    ...overrides,
  }
}

const courts = [
  court({ id: 'indoor-pro', environment: 'indoor', isTournamentGrade: true }),
  court({ id: 'indoor-plain', environment: 'indoor' }),
  court({ id: 'outdoor', environment: 'outdoor' }),
]

describe('COURT_FILTERS', () => {
  it('leads with an "all" filter so the default view shows everything', () => {
    expect(COURT_FILTERS[0].id).toBe('all')
  })

  it('gives every filter a distinct id', () => {
    const ids = COURT_FILTERS.map((filter) => filter.id)

    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('filterCourts', () => {
  it('returns every court for the "all" filter', () => {
    expect(filterCourts(courts, 'all')).toHaveLength(3)
  })

  it('keeps only indoor courts', () => {
    expect(filterCourts(courts, 'indoor').map((c) => c.id)).toEqual(['indoor-pro', 'indoor-plain'])
  })

  it('keeps only outdoor courts', () => {
    expect(filterCourts(courts, 'outdoor').map((c) => c.id)).toEqual(['outdoor'])
  })

  it('keeps only tournament-grade courts', () => {
    expect(filterCourts(courts, 'tournament').map((c) => c.id)).toEqual(['indoor-pro'])
  })

  it('does not mutate the input list', () => {
    const input = [...courts]

    filterCourts(input, 'indoor')

    expect(input).toHaveLength(3)
  })

  it('returns an empty list rather than throwing when nothing matches', () => {
    expect(filterCourts([court({ environment: 'indoor' })], 'outdoor')).toEqual([])
  })

  it('falls back to showing everything for an unrecognised filter', () => {
    // A stale URL query should degrade to the full list, not an empty page.
    expect(filterCourts(courts, 'nonsense')).toHaveLength(3)
  })
})

describe('isCourtFilterId', () => {
  it('accepts a known filter id', () => {
    expect(isCourtFilterId('indoor')).toBe(true)
  })

  it('rejects an unknown filter id', () => {
    expect(isCourtFilterId('nonsense')).toBe(false)
  })
})

describe('parseCourtFilter', () => {
  it('keeps a recognised filter id', () => {
    expect(parseCourtFilter('indoor')).toBe('indoor')
  })

  it('falls back to all when the id is missing', () => {
    expect(parseCourtFilter(undefined)).toBe('all')
  })

  // The raw search param is echoed back into every link on the page, so an
  // unrecognised value must not survive the round trip.
  it('falls back to all for an unrecognised id', () => {
    expect(parseCourtFilter('javascript:alert(1)')).toBe('all')
  })

  it('falls back to all for an id that only looks like a filter', () => {
    expect(parseCourtFilter('INDOOR')).toBe('all')
  })
})

describe('buildCatalogHref', () => {
  // One URL for the default view: the canonical catalog is a bare `/`, not two
  // addresses that render the same page.
  it('points the default filter at the bare catalog URL', () => {
    expect(buildCatalogHref('all')).toBe('/')
  })

  it('carries a non-default filter as a query param', () => {
    expect(buildCatalogHref('indoor')).toBe('/?filter=indoor')
  })

  it('round-trips whatever parseCourtFilter accepted', () => {
    expect(buildCatalogHref(parseCourtFilter('tournament'))).toBe('/?filter=tournament')
  })
})
