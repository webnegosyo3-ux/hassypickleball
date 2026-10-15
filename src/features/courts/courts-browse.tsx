import Link from 'next/link'
import { CourtCard } from './court-card'
import { COURT_FILTERS, filterCourts } from './court-filters'
import { StorefrontHero } from './storefront-hero'
import { buildCatalogHref, COURT_LAYOUTS, type CourtLayoutId } from './court-layout'
import type { Club, Court } from '@/lib/repositories/mappers'

type CourtsBrowseProps = {
  readonly club: Club
  readonly courts: readonly Court[]
  readonly filter?: string
  readonly layout?: CourtLayoutId
  /** Open start times today, keyed by court id. Absent when availability failed. */
  readonly openSlotsByCourt?: Readonly<Record<string, number>>
}

// A wrapping row of chips on a phone, a stacked left-hand list from `lg` up.
const CHIP_BASE =
  'rounded-lg border px-3.5 py-2 text-[13.5px] font-semibold transition lg:flex lg:items-center lg:justify-between lg:px-4 lg:py-2.5'
const CHIP_ACTIVE = `${CHIP_BASE} border-navy-mid bg-navy-mid text-white hover:text-white`
const CHIP_IDLE = `${CHIP_BASE} border-line bg-surface text-slate hover:border-navy-mid hover:text-navy-mid`

const SEGMENT_BASE = 'rounded-lg px-3.5 py-1.5 text-[13px] font-bold transition'
const SEGMENT_ACTIVE = `${SEGMENT_BASE} bg-navy-mid text-white hover:text-white`
const SEGMENT_IDLE = `${SEGMENT_BASE} text-muted hover:text-ink`

/** "07:00:00" from Postgres, "07:00" in the headline. */
function toClockTime(time: string): string {
  return time.slice(0, 5)
}

/**
 * The storefront catalog: filter chips and a layout toggle over the courts.
 *
 * Both controls are link-driven search params rather than client state — it
 * keeps this a Server Component and makes each view linkable. The links point
 * at `/`, which is the canonical catalog URL; `/courts` redirects here.
 */
export function CourtsBrowse({
  club,
  courts,
  filter = 'all',
  layout = 'gallery',
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
        <header className="mb-6 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.14em] text-olive">
              Book a court
            </p>
            <h1 className="mb-2.5 font-[family-name:var(--font-display)] text-[30px] font-bold leading-[1.08] sm:text-[40px] sm:leading-[1.05] tracking-[-0.03em]">
              {courts.length} courts. Open {toClockTime(club.opensAt)} to{' '}
              {toClockTime(club.closesAt)}.
            </h1>
            <p className="max-w-[52ch] text-pretty text-[16px] text-muted">
              Pick a court, choose how long you want to play, and add paddles or café items at
              checkout.
            </p>
          </div>

          <nav
            aria-label="Catalog layout"
            className="flex flex-none gap-[3px] self-start rounded-[10px] border border-line bg-surface p-[3px] sm:self-auto"
          >
            {COURT_LAYOUTS.map((option) => {
              const isActive = option.id === layout

              return (
                <Link
                  key={option.id}
                  href={buildCatalogHref({ filter, layout: option.id })}
                  aria-current={isActive ? 'page' : undefined}
                  className={isActive ? SEGMENT_ACTIVE : SEGMENT_IDLE}
                >
                  {option.label}
                </Link>
              )
            })}
          </nav>
        </header>

        <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start lg:gap-8">
          <div className="lg:sticky lg:top-24">
            <p className="mb-3 hidden text-[12px] font-bold uppercase tracking-[0.14em] text-olive lg:block">
              Categories
            </p>
            <nav
              aria-label="Filter courts"
              className="mb-[26px] flex flex-wrap gap-2.5 lg:mb-0 lg:flex-col lg:gap-2"
            >
              {COURT_FILTERS.map((option) => {
                const isActive = option.id === filter

                return (
                  <Link
                    key={option.id}
                    href={buildCatalogHref({ filter: option.id, layout })}
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
            {visible.length === 0 ? (
              <p className="rounded-[14px] border border-line bg-surface px-5 py-8 text-center text-muted">
                No courts match that filter.
              </p>
            ) : (
              <div
                className={
                  layout === 'compact'
                    ? 'flex flex-col gap-3'
                    : 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'
                }
              >
                {visible.map((court) => (
                  <CourtCard
                    key={court.id}
                    court={court}
                    currency={club.currency}
                    layout={layout}
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
