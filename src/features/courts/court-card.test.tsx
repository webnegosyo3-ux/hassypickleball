import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CourtCard } from './court-card'
import type { Court } from '@/lib/repositories/mappers'

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
    tags: ['Seating'],
    includes: ['Net and posts'],
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

describe('CourtCard', () => {
  it('names the court as a heading so the grid is navigable by landmark', () => {
    render(<CourtCard court={court()} />)

    expect(screen.getByRole('heading', { name: 'Court 1 — Center' })).toBeInTheDocument()
  })

  it('shows the surface and blurb', () => {
    render(<CourtCard court={court()} />)

    expect(screen.getByText('Cushioned acrylic')).toBeInTheDocument()
    expect(screen.getByText('Our show court.')).toBeInTheDocument()
  })

  it('shows the hourly rate formatted as currency, not raw centavos', () => {
    render(<CourtCard court={court()} />)

    expect(screen.getByText(/₱900/)).toBeInTheDocument()
    expect(screen.queryByText(/90000/)).not.toBeInTheDocument()
  })

  it('labels the environment', () => {
    render(<CourtCard court={court({ environment: 'outdoor' })} />)

    expect(screen.getByText(/outdoor/i)).toBeInTheDocument()
  })

  it('marks a tournament-grade court', () => {
    render(<CourtCard court={court({ isTournamentGrade: true })} />)

    expect(screen.getByText(/tournament grade/i)).toBeInTheDocument()
  })

  it('omits the tournament badge on an ordinary court', () => {
    render(<CourtCard court={court({ isTournamentGrade: false })} />)

    expect(screen.queryByText(/tournament grade/i)).not.toBeInTheDocument()
  })

  it('lists the court tags', () => {
    render(<CourtCard court={court({ tags: ['Seating', 'Air-conditioned'] })} />)

    expect(screen.getByText('Air-conditioned')).toBeInTheDocument()
  })

  it('renders without a blurb rather than printing null', () => {
    render(<CourtCard court={court({ blurb: null })} />)

    expect(screen.queryByText('null')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Court 1 — Center' })).toBeInTheDocument()
  })

  it('links to the court booking page', () => {
    render(<CourtCard court={court()} />)

    expect(screen.getByRole('link', { name: /view & book/i })).toHaveAttribute(
      'href',
      '/courts/court-1',
    )
  })

  it('gives the hero image alt text naming the court, not a generic label', () => {
    render(<CourtCard court={court({ heroImageUrl: 'https://example.com/c1.jpg' })} />)

    expect(screen.getByAltText('Court 1 — Center')).toBeInTheDocument()
  })

  it('prefers the photo the club uploaded', () => {
    render(<CourtCard court={court({ heroImageUrl: 'https://example.com/c1.jpg' })} />)

    // next/image rewrites the src to /_next/image?url=…, so compare the
    // decoded URL rather than the optimiser's wrapper.
    const src = decodeURIComponent(
      screen.getByAltText('Court 1 — Center').getAttribute('src') ?? '',
    )

    expect(src).toContain('https://example.com/c1.jpg')
  })

  it('falls back to a bundled photo when the club has not uploaded one', () => {
    render(<CourtCard court={court({ slug: 'court-03', heroImageUrl: null })} />)

    expect(screen.getByAltText('Court 1 — Center').getAttribute('src')).toContain('court-03.jpg')
  })

  it('still shows a photo for a court the bundle has no picture for', () => {
    render(<CourtCard court={court({ slug: 'court-07', heroImageUrl: null })} />)

    expect(screen.getByRole('img')).toBeInTheDocument()
  })

  it('qualifies the rate as per hour so the price is not read as the session total', () => {
    render(<CourtCard court={court()} />)

    expect(screen.getByText('per hour')).toBeInTheDocument()
  })

  it('shows the maximum number of players the court seats', () => {
    render(<CourtCard court={court({ maxPlayers: 6 })} />)

    expect(screen.getByText('Up to 6 players')).toBeInTheDocument()
  })

  it('reports how many slots are still open today', () => {
    render(<CourtCard court={court()} openSlotCount={7} />)

    expect(screen.getByText('7 slots open today')).toBeInTheDocument()
  })

  it('says "1 slot" rather than "1 slots" for the last opening', () => {
    render(<CourtCard court={court()} openSlotCount={1} />)

    expect(screen.getByText('1 slot open today')).toBeInTheDocument()
  })

  it('says a fully booked court is fully booked instead of showing "0 slots"', () => {
    render(<CourtCard court={court()} openSlotCount={0} />)

    expect(screen.getByText('Fully booked today')).toBeInTheDocument()
  })

  it('claims nothing about availability when the count could not be loaded', () => {
    render(<CourtCard court={court()} />)

    expect(screen.queryByText(/slots open today/)).not.toBeInTheDocument()
    expect(screen.queryByText('Fully booked today')).not.toBeInTheDocument()
  })
})
