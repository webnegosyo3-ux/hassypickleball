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
  it('heads the catalog with a single instruction rather than the opening hours', () => {
    render(<CourtsBrowse club={club()} courts={[court(), court({ id: 'c2', slug: 'c2' })]} />)

    const heading = screen.getByRole('heading', { level: 1 })

    expect(heading).toHaveTextContent('Book a court')
    expect(heading).not.toHaveTextContent(/courts\. Open/i)
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

  it('offers one view of the catalog, with no layout switch to choose from', () => {
    render(<CourtsBrowse club={club()} courts={[court()]} />)

    expect(screen.queryByRole('navigation', { name: 'Catalog layout' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view & book/i })).toBeInTheDocument()
  })

  it('keeps the active filter on its chip and nothing else in the URL', () => {
    render(<CourtsBrowse club={club()} courts={[court()]} filter="indoor" />)

    const filters = screen.getByRole('navigation', { name: 'Filter courts' })

    expect(within(filters).getByRole('link', { name: 'Indoor' })).toHaveAttribute(
      'href',
      '/?filter=indoor',
    )
    expect(within(filters).getByRole('link', { name: 'All courts' })).toHaveAttribute('href', '/')
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
