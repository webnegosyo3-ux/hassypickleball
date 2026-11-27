import Image from 'next/image'
import Link from 'next/link'
import { courtPhoto } from './court-image'
import { formatMoney } from '@/lib/format/money'
import type { Court } from '@/lib/repositories/mappers'

export type CourtCardProps = {
  readonly court: Court
  readonly currency?: string
  /**
   * Start times still free today. Optional: availability needs a privileged
   * read that can fail independently of the catalog, and an unknown count is
   * better left unsaid than guessed.
   */
  readonly openSlotCount?: number
}

/** Small enough for a two-up phone grid, where the card is about 160px wide. */
const BADGE =
  'rounded-full px-2 py-1 text-[10px] font-bold uppercase leading-none tracking-[0.08em] sm:px-2.5 sm:py-1.5 sm:text-[11px]'

/** The colour behind the photo while it loads. */
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
    <p className="flex items-center gap-1.5 text-[11.5px] leading-snug text-slate sm:gap-2 sm:text-[13px]">
      {/* Decorative — the wording already carries the state, so the dot is
          not the only thing distinguishing open from full. */}
      <span
        aria-hidden
        className={`inline-block size-2 flex-none rounded-full ${isOpen ? 'bg-olive' : 'bg-line-heavy'}`}
      />
      {openSlotsLabel(count)}
    </p>
  )
}

/**
 * One court in the catalog. The whole card is not a link — the court name is a
 * heading and the action is a single named button, so the card reads as a
 * description followed by one thing to do.
 *
 * Everything below `sm` is sized for the two-up phone grid rather than a single
 * wide column: the price sits under the name instead of beside it, the tags step
 * aside, and the button takes the full card width.
 */
export function CourtCard({ court, currency = 'PHP', openSlotCount }: CourtCardProps) {
  const photo = courtPhoto(court)

  return (
    <article className="flex flex-col overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_1px_2px_rgba(10,18,48,0.04)] transition duration-200 hover:-translate-y-1 hover:border-navy-mid/40 hover:shadow-[0_18px_40px_-16px_rgba(23,70,201,0.35)] sm:rounded-[18px]">
      <div className={`relative h-[96px] ${HERO_WELL} sm:h-[140px]`}>
        <Image
          src={photo}
          alt={court.name}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1280px) 50vw, 33vw"
          className="object-cover"
        />

        {/* Stacked on a phone: two badges side by side do not fit 160px. */}
        <div className="pointer-events-none absolute left-2.5 top-2.5 flex flex-col items-start gap-1 sm:left-3.5 sm:top-3.5 sm:flex-row sm:gap-2">
          <span className={`${BADGE} bg-navy text-white`}>{court.environment}</span>
          {court.isTournamentGrade ? (
            <span className={`${BADGE} bg-lime text-navy`}>Tournament grade</span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 px-3 pb-3 pt-3 sm:gap-2.5 sm:px-4 sm:pb-4 sm:pt-3.5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
          <div className="min-w-0">
            <h2 className="font-[family-name:var(--font-display)] text-[16px] font-bold leading-tight tracking-[-0.02em] sm:text-[18px]">
              {court.name}
            </h2>
            <p className="mt-[3px] text-[12px] text-muted sm:text-[13px]">{court.surface}</p>
            <p className="mt-1 text-[11.5px] font-semibold text-slate sm:text-[12.5px]">
              Up to {court.maxPlayers} players
            </p>
          </div>
          <div className="flex flex-none items-baseline gap-1 sm:block sm:text-right">
            <p className="font-[family-name:var(--font-display)] text-[15px] font-bold leading-none sm:text-[18px]">
              {formatMoney(court.basePriceCents, currency)}
            </p>
            <p className="text-[11px] text-muted sm:mt-1 sm:text-[12px]">per hour</p>
          </div>
        </div>

        {court.blurb ? (
          <p className="line-clamp-2 text-[12px] text-muted sm:text-[13px]">{court.blurb}</p>
        ) : null}

        {/* Tags are the first thing to go when the card is half a screen wide;
            the surface, the player cap and the price stay. */}
        {court.tags.length > 0 ? (
          <ul className="hidden flex-wrap gap-[7px] sm:flex">
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
        <div className="mt-auto flex flex-col gap-2 pt-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          {openSlotCount === undefined ? (
            <span aria-hidden className="hidden sm:block" />
          ) : (
            <AvailabilityLine count={openSlotCount} />
          )}

          <Link
            href={`/courts/${court.slug}`}
            className="w-full rounded-[9px] bg-navy-mid px-3 py-2.5 text-center text-[12.5px] font-bold text-white transition hover:bg-navy hover:text-white sm:w-auto sm:flex-none sm:px-4 sm:py-2 sm:text-[13px]"
          >
            View &amp; book
          </Link>
        </div>
      </div>
    </article>
  )
}
