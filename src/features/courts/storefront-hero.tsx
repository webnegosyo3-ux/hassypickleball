import { formatMoney } from '@/lib/format/money'
import type { Club, Court } from '@/lib/repositories/mappers'

type StorefrontHeroProps = {
  readonly club: Club
  readonly courts: readonly Court[]
}

/** "07:00:00" from Postgres, "7:00 AM" on the page. */
function toClockLabel(time: string): string {
  const [hours = '0', minutes = '00'] = time.split(':')
  const hour = Number(hours)
  const suffix = hour >= 12 ? 'PM' : 'AM'

  return `${hour % 12 === 0 ? 12 : hour % 12}:${minutes} ${suffix}`
}

/**
 * Top-down pickleball court in line art: the baselines, the kitchen lines, the
 * centre service lines, and the net. Purely decorative, so it is hidden from
 * assistive tech and drawn in `currentColor` to inherit the hero's tint.
 */
function CourtLines() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 600 400"
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 size-full text-white/[0.09]"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
    >
      <rect x="40" y="30" width="520" height="340" />
      <line x1="300" y1="30" x2="300" y2="370" strokeWidth="6" />
      <line x1="170" y1="30" x2="170" y2="370" />
      <line x1="430" y1="30" x2="430" y2="370" />
      <line x1="40" y1="200" x2="170" y2="200" />
      <line x1="430" y1="200" x2="560" y2="200" />
    </svg>
  )
}

type StatProps = {
  readonly value: string
  readonly label: string
}

function Stat({ value, label }: StatProps) {
  return (
    <div className="min-w-0 text-center">
      <dt className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-white/60 sm:text-[11.5px]">
        {label}
      </dt>
      <dd className="mt-1 whitespace-nowrap font-[family-name:var(--font-display)] text-[16px] font-bold leading-none tracking-[-0.02em] text-white sm:text-[26px]">
        {value}
      </dd>
    </div>
  )
}

/**
 * The storefront's front door, in the Hassy palette: the near-black navy of the
 * club's outline, the royal blue of its court, and the optic yellow of the ball.
 *
 * The logo itself belongs to the header, where it sits on every page — repeating
 * it here made the hero a second copy of the same mark. What is left is the
 * headline, the numbers, and the court drawn in line art behind them.
 *
 * The headline is a paragraph, not a heading, because the catalog below owns
 * the page's single <h1>.
 */
export function StorefrontHero({ club, courts }: StorefrontHeroProps) {
  const cheapest = courts.length > 0 ? Math.min(...courts.map((c) => c.basePriceCents)) : null

  return (
    <section aria-label="Welcome" className="relative isolate overflow-hidden bg-navy text-white">
      {/* Royal-blue court glow behind the copy, and a lime flare for the ball. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(60%_90%_at_85%_40%,#1746c9_0%,transparent_70%),radial-gradient(40%_50%_at_8%_100%,rgba(217,228,58,0.16)_0%,transparent_70%),linear-gradient(135deg,#0a1230_0%,#0f2766_100%)]"
      />
      <div className="absolute inset-0 -z-10">
        <CourtLines />
      </div>

      <div className="mx-auto w-full max-w-[1280px] px-4 pb-12 pt-8 sm:px-7 sm:pt-12 md:pb-20 md:pt-16">
        <div className="mx-auto min-w-0 max-w-[760px] text-center">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-[12px] font-bold uppercase tracking-[0.14em] text-lime">
            <span aria-hidden className="size-2 rounded-full bg-lime" />
            Now booking<span className="hidden sm:inline"> · {club.name}</span>
          </p>

          <p className="font-[family-name:var(--font-display)] text-[42px] font-extrabold leading-[0.98] tracking-[-0.035em] text-balance sm:text-[64px] lg:text-[78px]">
            Rally. Dink.
            <br />
            <span className="text-lime">Let’s begin.</span>
          </p>

          <p className="mx-auto mt-5 max-w-[48ch] text-pretty text-[16px] leading-relaxed text-white/80 md:text-[17px]">
            Reserve a court in under a minute. Pick your hour, bring your crew, and add paddles or
            café items at checkout — all in one booking.
          </p>

          {/* No call to action here: the header carries "See availability" on
              every page, and repeating it 300px below just asked the visitor to
              pick between two buttons that scroll to the same place. */}

          {/* Three columns, labels above values and centred. The middle track
              is sized to the opening hours so "6:00 AM – 11:59 PM" stays on one
              line — wrapping it left that value on a different baseline from
              the two beside it. The max-width stops them drifting apart wide. */}
          <dl className="mt-8 grid grid-cols-[1fr_auto_1fr] gap-x-4 gap-y-5 border-t border-white/15 pt-5 text-center sm:mx-auto sm:max-w-[520px] md:mt-10 md:pt-6">
            <Stat value={String(courts.length)} label="Courts" />
            <Stat
              value={`${toClockLabel(club.opensAt)} – ${toClockLabel(club.closesAt)}`}
              label="Open daily"
            />
            {cheapest === null ? null : (
              <Stat value={formatMoney(cheapest, club.currency)} label="From / hour" />
            )}
          </dl>
        </div>
      </div>

      {/* A court-line stripe to land the hero on the page below. */}
      <div
        aria-hidden
        className="h-1.5 bg-[linear-gradient(90deg,#1746c9_0%,#1746c9_70%,#d9e43a_70%,#d9e43a_100%)]"
      />
    </section>
  )
}
