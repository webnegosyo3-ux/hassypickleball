import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CourtsBrowse } from './courts-browse'
import type { Club, Court } from '@/lib/repositories/mappers'

function club(overrides: Partial<Club> = {}): Club {
  return {
    id: 'club-1',
    name: 'Baseline',
    slug: 'baseline',
    timeZone: 'Asia/Manila',
    currency: 'PHP',
    opensAt: '07:00:00',
    closesAt: '22:00:00',
    slotMinutes: 30,
    minDurationMinutes: 60,
    maxDurationMinutes: 180,
    phone: '(555) 019-8842',
    cancellationWindowHours: 12,
    groupBookingNote: null,
    ...overrides,
  }
}

function court(overrides: Partial<Court> = {}): Court {
  return {
    id: 'court-1',
    clubId: 'club-1',
    name: 'Court 1 — Center',
    slug: 'court-1',
    surface: 'Cushioned acrylic',
    environment: 'indoor',
    isTournamentGrade: false,
    blurb: 'Our show court.',
    notes: [],
    tags: [],
    includes: [],
    heroImageUrl: null,
    basePriceCents: 90000,
    sortOrder: 1,
    isActive: true,
    minPlayers: 2,
    maxPlayers: 4,
    includedPlayers: 4,
    extraPlayerFeeCents: 0,
    ...overrides,
  }
}

describe('CourtsBrowse', () => {
  it('headlines the catalog with the court count and the club opening hours', () => {
    render(<CourtsBrowse club={club()} courts={[court(), court({ id: 'c2', slug: 'c2' })]} />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      '2 courts. Open 07:00 to 22:00.',
    )
  })

  it('links filter chips at the storefront root so the catalog has one canonical URL', () => {
    render(<CourtsBrowse club={club()} courts={[court()]} />)

    expect(screen.getByRole('link', { name: 'All courts' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Indoor' })).toHaveAttribute('href', '/?filter=indoor')
  })

  it('marks the active filter as the current page for assistive tech', () => {
    render(<CourtsBrowse club={club()} courts={[court()]} filter="indoor" />)

    expect(screen.getByRole('link', { name: 'Indoor' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'All courts' })).not.toHaveAttribute('aria-current')
  })

  it('renders only the courts matching the active filter', () => {
    const courts = [
      court({ id: 'indoor-1', slug: 'indoor-1', name: 'Indoor One', environment: 'indoor' }),
      court({ id: 'outdoor-1', slug: 'outdoor-1', name: 'Outdoor One', environment: 'outdoor' }),
    ]

    render(<CourtsBrowse club={club()} courts={courts} filter="outdoor" />)

    expect(screen.getByRole('heading', { name: 'Outdoor One' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Indoor One' })).not.toBeInTheDocument()
  })

  it('explains an empty result instead of showing a blank grid', () => {
    render(
      <CourtsBrowse club={club()} courts={[court({ environment: 'indoor' })]} filter="outdoor" />,
    )

    expect(screen.getByText('No courts match that filter.')).toBeInTheDocument()
  })

  it('prices courts in the club currency', () => {
    render(<CourtsBrowse club={club({ currency: 'USD' })} courts={[court()]} />)

    // The hero repeats the lowest price, so look inside the court's own card.
    const card = screen.getByRole('heading', { name: 'Court 1 — Center' }).closest('article')

    expect(within(card as HTMLElement).getByText(/\$900/)).toBeInTheDocument()
  })

  it('offers a gallery and a compact view of the same catalog', () => {
    render(<CourtsBrowse club={club()} courts={[court()]} />)

    const toggle = screen.getByRole('navigation', { name: 'Catalog layout' })

    expect(within(toggle).getByRole('link', { name: 'Gallery' })).toHaveAttribute('href', '/')
    expect(within(toggle).getByRole('link', { name: 'Compact' })).toHaveAttribute(
      'href',
      '/?layout=compact',
    )
  })

  it('marks the active layout as the current page for assistive tech', () => {
    render(<CourtsBrowse club={club()} courts={[court()]} layout="compact" />)

    const toggle = screen.getByRole('navigation', { name: 'Catalog layout' })

    expect(within(toggle).getByRole('link', { name: 'Compact' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(toggle).getByRole('link', { name: 'Gallery' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('keeps the active filter when switching layout', () => {
    render(<CourtsBrowse club={club()} courts={[court()]} filter="indoor" />)

    const toggle = screen.getByRole('navigation', { name: 'Catalog layout' })

    expect(within(toggle).getByRole('link', { name: 'Compact' })).toHaveAttribute(
      'href',
      '/?filter=indoor&layout=compact',
    )
  })

  it('keeps the active layout when switching filter', () => {
    render(<CourtsBrowse club={club()} courts={[court()]} layout="compact" />)

    const filters = screen.getByRole('navigation', { name: 'Filter courts' })

    expect(within(filters).getByRole('link', { name: 'Indoor' })).toHaveAttribute(
      'href',
      '/?filter=indoor&layout=compact',
    )
    expect(within(filters).getByRole('link', { name: 'All courts' })).toHaveAttribute(
      'href',
      '/?layout=compact',
    )
  })

  it('renders the compact row rather than the gallery card in the compact layout', () => {
    render(<CourtsBrowse club={club()} courts={[court()]} layout="compact" />)

    expect(screen.getByRole('link', { name: 'Book' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /view & book/i })).not.toBeInTheDocument()
  })

  it('shows each court its own open-slot count', () => {
    const courts = [
      court({ id: 'a', slug: 'a', name: 'Court A' }),
      court({ id: 'b', slug: 'b', name: 'Court B' }),
    ]

    render(<CourtsBrowse club={club()} courts={courts} openSlotsByCourt={{ a: 5, b: 0 }} />)

    expect(screen.getByText('5 slots open today')).toBeInTheDocument()
    expect(screen.getByText('Fully booked today')).toBeInTheDocument()
  })

  it('omits availability for a court the count does not cover', () => {
    render(<CourtsBrowse club={club()} courts={[court({ id: 'a', slug: 'a' })]} />)

    expect(screen.queryByText(/slots open today/)).not.toBeInTheDocument()
  })
})
