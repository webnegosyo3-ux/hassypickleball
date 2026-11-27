import { notFound } from 'next/navigation'
import { countOpenSlots } from '@/features/booking/server/open-slots'
import { loadCatalog } from '@/features/courts/catalog'
import { parseCourtFilter } from '@/features/courts/court-filters'
import { CourtsBrowse } from '@/features/courts/courts-browse'
import { toDayStringInZone } from '@/lib/format/time'

/** Single-club deployment for now; the schema is multi-club ready. */
const CLUB_SLUG = 'baseline'

type HomePageProps = {
  searchParams: Promise<{ filter?: string }>
}

/**
 * The storefront catalog at the site root.
 *
 * Server Component with no client fetch. The catalog half is cached — the same
 * public rows for every visitor — while today's open-slot counts are read
 * fresh, because a stale availability count sells a slot that is already gone.
 *
 * The filter is normalised here rather than passed through raw: it is echoed
 * back into every link on the page.
 */
export default async function HomePage({ searchParams }: HomePageProps) {
  const { filter } = await searchParams

  const catalog = await loadCatalog(CLUB_SLUG)

  if (!catalog) {
    notFound()
  }

  const { club, courts } = catalog

  const openSlotsByCourt = await countOpenSlots({
    club,
    courtIds: courts.map((court) => court.id),
    day: toDayStringInZone(new Date(), club.timeZone),
  })

  return (
    <CourtsBrowse
      club={club}
      courts={courts}
      filter={parseCourtFilter(filter)}
      openSlotsByCourt={openSlotsByCourt}
    />
  )
}
