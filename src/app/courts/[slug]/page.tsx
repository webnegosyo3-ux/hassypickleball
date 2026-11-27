import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { BookingPickerSkeleton, CourtBookingSection } from './court-booking-section'
import { BookingStage } from '@/features/booking/ui/booking-stage'
import { parseDurationMinutes } from '@/features/booking/view/court-detail'
import { loadCatalog } from '@/features/courts/catalog'
import { parseDayString, toDayStringInZone } from '@/lib/format/time'
import { formatMoney } from '@/lib/format/money'

const CLUB_SLUG = 'baseline'

type CourtPageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ day?: string; duration?: string; at?: string }>
}

/** A start time a customer arrived with, or null if the one they sent is not a time. */
function parseStartTime(raw: string | undefined): string | null {
  if (raw === undefined) {
    return null
  }

  return Number.isNaN(Date.parse(raw)) ? null : raw
}

export default async function CourtPage({ params, searchParams }: CourtPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams])

  // The club and its courts change when staff edit them, not per visitor, so
  // they come from the shared catalog cache — two round trips this page used
  // to pay on every single view.
  const catalog = await loadCatalog(CLUB_SLUG)

  if (!catalog) {
    notFound()
  }

  const { club } = catalog
  const court = catalog.courts.find((entry) => entry.slug === slug)

  if (!court) {
    notFound()
  }

  const today = toDayStringInZone(new Date(), club.timeZone)
  const day = parseDayString(query.day, today)
  const durationMinutes = parseDurationMinutes({ raw: query.duration, club })
  const preselectedAt = parseStartTime(query.at)

  // The extra bottom padding on phones is for the docked summary bar the form
  // does not use, but the space keeps the last card clear of the footer.
  return (
    <main className="mx-auto w-full max-w-[1280px] px-4 pb-16 pt-5 sm:px-7 sm:pt-7">
      {/* The catalog lives at the root; /courts only 308s here. */}
      <Link href="/" className="text-[14px] font-medium text-muted hover:text-olive">
        ← All courts
      </Link>

      <div className="mt-4 flex flex-col gap-5">
        {/* The court's own card is the pitch, and it stops being needed the
            moment the court is held: the confirmation says everything it did. */}
        <BookingStage
          summary={
            <article className="overflow-hidden rounded-[18px] border border-line bg-surface">
              <div className="relative h-[200px] bg-surface-sunken sm:h-[300px]">
                {court.heroImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- court photos are remote and no image loader domain is configured yet
                  <img
                    src={court.heroImageUrl}
                    alt={`${court.name} seen from the sideline`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <p className="grid h-full place-items-center text-[14px] text-subtle">
                    Photo coming soon
                  </p>
                )}
              </div>

              <div className="p-5 sm:p-6">
                {/* The title leads, centred, with the price under it: side by side
                the price column read as a second, quieter title. */}
                <div className="mb-4 flex flex-col items-center gap-2 text-center">
                  {/* Full width even though the row centres: the heading is centred
                  text, not a block shrunk to its own letters. */}
                  <div className="w-full min-w-0">
                    <h1 className="font-[family-name:var(--font-display)] text-[26px] font-bold leading-[1.05] tracking-[-0.03em] sm:text-[32px]">
                      {court.name}
                    </h1>
                    {court.blurb ? (
                      <p className="mt-1.5 text-[14px] text-muted">{court.blurb}</p>
                    ) : null}
                    <p className="mt-1.5 text-[13px] font-semibold text-slate">
                      Up to {court.maxPlayers} players
                    </p>
                  </div>
                  <p className="flex-none">
                    <span className="font-[family-name:var(--font-display)] text-[24px] font-bold sm:block sm:text-[26px]">
                      {formatMoney(court.basePriceCents, club.currency)}
                    </span>{' '}
                    <span className="text-[12px] text-muted sm:block">per hour, off-peak</span>
                  </p>
                </div>

                {court.tags.length > 0 ? (
                  <ul className="mb-5 flex flex-wrap justify-center gap-2">
                    {court.tags.map((tag) => (
                      <li
                        key={tag}
                        className="rounded-[8px] border border-line bg-surface-alt px-2.5 py-1.5 text-[12.5px] font-medium text-slate"
                      >
                        {tag}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {court.includes.length > 0 || court.notes.length > 0 ? (
                  <div className="grid gap-6 border-t border-surface-sunken pt-5 sm:grid-cols-2">
                    {court.includes.length > 0 ? (
                      <section>
                        <h2 className="mb-2.5 text-center text-[12px] font-bold uppercase tracking-[0.12em] text-olive">
                          Included
                        </h2>
                        <ul className="flex flex-col gap-2">
                          {court.includes.map((item) => (
                            <li key={item} className="flex gap-2.5 text-[14px] text-slate">
                              <span aria-hidden className="font-bold text-olive">
                                ✓
                              </span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}

                    {court.notes.length > 0 ? (
                      <section>
                        <h2 className="mb-2.5 text-center text-[12px] font-bold uppercase tracking-[0.12em] text-olive">
                          Good to know
                        </h2>
                        <ul className="flex flex-col gap-2">
                          {court.notes.map((note) => (
                            <li key={note} className="text-[14px] text-muted">
                              {note}
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </article>
          }
        >
          {/* Keyed so a param change arriving from a shared link or the back
            button remounts the form instead of leaving yesterday's times on
            screen. The fallback is the honest one: this half really is still
            being read. */}
          <Suspense
            key={`${day}-${durationMinutes}-${preselectedAt ?? ''}`}
            fallback={<BookingPickerSkeleton />}
          >
            <CourtBookingSection
              club={club}
              court={court}
              day={day}
              today={today}
              durationMinutes={durationMinutes}
              preselectedAt={preselectedAt}
            />
          </Suspense>
        </BookingStage>

        {club.groupBookingNote ? (
          <aside className="rounded-[18px] bg-navy px-6 py-5 text-center text-white lg:max-w-[420px] lg:self-end">
            <h2 className="font-[family-name:var(--font-display)] text-[16px] font-bold">
              Playing with a group?
            </h2>
            <p className="mt-1.5 text-pretty text-[13.5px] text-white/72">
              {club.groupBookingNote}
              {club.phone ? ` Call the desk on ${club.phone}.` : null}
            </p>
          </aside>
        ) : null}
      </div>
    </main>
  )
}
