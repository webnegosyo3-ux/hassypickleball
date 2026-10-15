import Image from 'next/image'
import Link from 'next/link'
import type { CourtLayoutId } from './court-layout'
import { formatMoney } from '@/lib/format/money'
import type { Court } from '@/lib/repositories/mappers'

export type CourtCardProps = {
  readonly court: Court
  readonly currency?: string
  readonly layout?: CourtLayoutId
  /**
   * Start times still free today. Optional: availability needs a privileged
   * read that can fail independently of the catalog, and an unknown count is
   * better left unsaid than guessed.
   */
  readonly openSlotCount?: number
}

type CourtViewProps = {
  readonly court: Court
  readonly currency: string
  readonly openSlotCount?: number
}

const BADGE =
  'rounded-full px-2.5 py-1.5 text-[11px] font-bold uppercase leading-none tracking-[0.08em]'

const ROW_CHIP =
  'rounded-md px-2 py-1 text-[11px] font-bold uppercase leading-none tracking-[0.06em]'

/** The empty hero well, visible until a club uploads a court photo. */
const HERO_WELL = 'bg-[#E9EEF4]'

/** "0 slots open today" reads like a bug; a court with nothing left is full. */
function openSlotsLabel(count: number): string {
  if (count === 0) {
    return 'Fully booked today'
  }

  return `${count} slot${count === 1 ? '' : 's'} open today`
}

type AvailabilityLineProps = {
  readonly count: number
}

function AvailabilityLine({ count }: AvailabilityLineProps) {
  const isOpen = count > 0

  return (
    <p className="flex items-center gap-2 text-[13px] text-slate">
      {/* Decorative — the wording already carries the state, so the dot is
          not the only thing distinguishing open from full. */}
      <span
        aria-hidden
        className={`inline-block size-2 rounded-full ${isOpen ? 'bg-olive' : 'bg-line-heavy'}`}
      />
      {openSlotsLabel(count)}
    </p>
  )
}

export function CourtCard({
  court,
  currency = 'PHP',
  layout = 'gallery',
  openSlotCount,
}: CourtCardProps) {
  const view = { court, currency, openSlotCount }

  if (layout === 'compact') {
    return <CompactCourtRow {...view} />
  }

  return <GalleryCourtCard {...view} />
}

function GalleryCourtCard({ court, currency, openSlotCount }: CourtViewProps) {
  return (
    <article className="flex flex-col overflow-hidden rounded-[18px] border border-line bg-surface shadow-[0_1px_2px_rgba(10,18,48,0.04)] transition duration-200 hover:-translate-y-1 hover:border-navy-mid/40 hover:shadow-[0_18px_40px_-16px_rgba(23,70,201,0.35)]">
      <div className={`relative h-[140px] ${HERO_WELL}`}>
        {court.heroImageUrl ? (
          <Image
            src={court.heroImageUrl}
            alt={court.name}
            fill
            sizes="(max-width: 900px) 100vw, 50vw"
            className="object-cover"
          />
        ) : null}

        <div className="pointer-events-none absolute left-3.5 top-3.5 flex gap-2">
          <span className={`${BADGE} bg-navy text-white`}>{court.environment}</span>
          {court.isTournamentGrade ? (
            <span className={`${BADGE} bg-lime text-navy`}>Tournament grade</span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 px-4 pb-4 pt-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-[family-name:var(--font-display)] text-[18px] font-bold tracking-[-0.02em]">
              {court.name}
            </h2>
            <p className="mt-[3px] text-[13px] text-muted">{court.surface}</p>
            <p className="mt-1 text-[12.5px] font-semibold text-slate">
              Up to {court.maxPlayers} players
            </p>
          </div>
          <div className="flex-none text-right">
            <p className="font-[family-name:var(--font-display)] text-[18px] font-bold leading-none">
              {formatMoney(court.basePriceCents, currency)}
            </p>
            <p className="mt-1 text-[12px] text-muted">per hour</p>
          </div>
        </div>

        {court.blurb ? <p className="text-[13px] text-muted">{court.blurb}</p> : null}

        {court.tags.length > 0 ? (
          <ul className="flex flex-wrap gap-[7px]">
            {court.tags.map((tag) => (
              <li
                key={tag}
                className="rounded-lg border border-line bg-surface-alt px-2.5 py-[5px] text-[12px] font-medium text-slate"
              >
                {tag}
              </li>
            ))}
          </ul>
        ) : null}

        {/* mt-auto pins the action row to the bottom so cards of differing
            blurb length still line their buttons up across the grid. */}
        <div className="mt-auto flex items-center justify-between gap-3 pt-1.5">
          {openSlotCount === undefined ? <span /> : <AvailabilityLine count={openSlotCount} />}

          <Link
            href={`/courts/${court.slug}`}
            className="flex-none rounded-[9px] bg-navy-mid px-4 py-2 text-[13px] font-bold text-white transition hover:bg-navy hover:text-white"
          >
            View &amp; book
          </Link>
        </div>
      </div>
    </article>
  )
}

function CompactCourtRow({ court, currency, openSlotCount }: CourtViewProps) {
  const details = [court.surface, `Up to ${court.maxPlayers} players`, ...court.tags].join(' · ')

  return (
    <article className="flex flex-col gap-4 rounded-[14px] border border-line bg-surface p-3.5 transition hover:border-line-heavy sm:flex-row sm:items-center sm:gap-[18px]">
      <div
        className={`relative h-[88px] w-full flex-none overflow-hidden rounded-[10px] sm:w-[132px] ${HERO_WELL}`}
      >
        {court.heroImageUrl ? (
          <Image
            src={court.heroImageUrl}
            alt={court.name}
            fill
            sizes="132px"
            className="object-cover"
          />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
          <h2 className="font-[family-name:var(--font-display)] text-[19px] font-bold tracking-[-0.02em]">
            {court.name}
          </h2>
          <span className={`${ROW_CHIP} bg-surface-sunken text-slate`}>{court.environment}</span>
          {court.isTournamentGrade ? (
            <span className={`${ROW_CHIP} bg-lime text-navy`}>Tournament grade</span>
          ) : null}
        </div>

        <p className="text-[12.5px] text-muted">{details}</p>
      </div>

      <div className="flex flex-none items-center justify-between gap-3.5 sm:flex-col sm:items-end sm:gap-2">
        {openSlotCount === undefined ? null : <AvailabilityLine count={openSlotCount} />}

        <div className="flex items-center gap-3.5">
          <p className="font-[family-name:var(--font-display)] text-[20px] font-bold">
            {formatMoney(court.basePriceCents, currency)}
            <span className="text-[12px] font-normal text-muted">/hr</span>
          </p>
          <Link
            href={`/courts/${court.slug}`}
            className="rounded-[9px] bg-lime px-[18px] py-[11px] text-[14px] font-bold text-navy transition hover:bg-[#CBE64A] hover:text-navy"
          >
            Book
          </Link>
        </div>
      </div>
    </article>
  )
}
