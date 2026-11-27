import Link from 'next/link'
import { CourtCard } from './court-card'
import { buildCatalogHref, COURT_FILTERS, filterCourts } from './court-filters'
import { StorefrontHero } from './storefront-hero'
import type { Club, Court } from '@/lib/repositories/mappers'

type CourtsBrowseProps = {
  readonly club: Club
  readonly courts: readonly Court[]
  readonly filter?: string
  /** Open start times today, keyed by court id. Absent when availability failed. */
  readonly openSlotsByCourt?: Readonly<Record<string, number>>
}

// Two even columns of chips on a phone (four filters, so nothing is orphaned
// on a second row), a stacked left-hand list from `lg` up.
const CHIP_BASE =
  'flex items-center justify-center rounded-lg border px-3.5 py-2.5 text-center text-[13.5px] font-semibold transition lg:justify-between lg:px-4 lg:py-2.5 lg:text-left'
const CHIP_ACTIVE = `${CHIP_BASE} border-navy-mid bg-navy-mid text-white hover:text-white`
const CHIP_IDLE = `${CHIP_BASE} border-line bg-surface text-slate hover:border-navy-mid hover:text-navy-mid`

/**
 * The storefront catalog: one heading, the filter chips, and the courts.
 *
 * There is deliberately one view of the catalog. A second, denser layout meant
 * every visitor had to choose before booking, and the choice was the only thing
 * the toggle ever changed.
 *
 * The filter is a link-driven search param rather than client state — it keeps
 * this a Server Component and makes each view linkable. The links point at `/`,
 * which is the canonical catalog URL; `/courts` redirects here.
 */
export function CourtsBrowse({
  club,
  courts,
  filter = 'all',
  openSlotsByCourt,
}: CourtsBrowseProps) {
  const visible = filterCourts(courts, filter)

  return (
    <>
      <StorefrontHero club={club} courts={courts} />
      <main
        id="courts"
        className="mx-auto w-full max-w-[1280px] scroll-mt-16 px-4 pb-20 pt-10 sm:px-7"
      >
        <header className="mb-6 text-center">
          <h1 className="mb-2.5 font-[family-name:var(--font-display)] text-[30px] font-bold leading-[1.08] tracking-[-0.03em] sm:text-[40px] sm:leading-[1.05]">
            Book a court
          </h1>
          <p className="mx-auto max-w-[52ch] text-pretty text-[16px] text-muted">
            Pick a court, choose how long you want to play, and add paddles or café items at
            checkout.
          </p>
        </header>

        <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start lg:gap-8">
          <div className="lg:sticky lg:top-24">
            <p className="mb-3 hidden text-[12px] font-bold uppercase tracking-[0.14em] text-olive lg:block">
              Categories
            </p>
            <nav
              aria-label="Filter courts"
              className="mb-[26px] grid grid-cols-2 gap-2.5 lg:mb-0 lg:flex lg:flex-col lg:gap-2"
            >
              {COURT_FILTERS.map((option) => {
                const isActive = option.id === filter

                return (
                  <Link
                    key={option.id}
                    href={buildCatalogHref(option.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={isActive ? CHIP_ACTIVE : CHIP_IDLE}
                  >
                    <span>{option.label}</span>
                    <span aria-hidden className="hidden text-[12px] font-bold opacity-70 lg:inline">
                      {filterCourts(courts, option.id).length}
                    </span>
                  </Link>
                )
              })}
            </nav>
          </div>

          <div>
            {/* Two up on a phone: four courts side by side halves the scrolling
                a visitor does before they pick one. */}
            {visible.length === 0 ? (
              <p className="rounded-[14px] border border-line bg-surface px-5 py-8 text-center text-muted">
                No courts match that filter.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
                {visible.map((court) => (
                  <CourtCard
                    key={court.id}
                    court={court}
                    currency={club.currency}
                    openSlotCount={openSlotsByCourt?.[court.id]}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  )
}
