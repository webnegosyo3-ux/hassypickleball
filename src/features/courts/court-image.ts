import type { Court } from '@/lib/repositories/mappers'

/**
 * The photo a court card shows.
 *
 * A club that has uploaded its own hero image gets that. Everyone else gets one
 * of the bundled photos below, matched by slug, so the catalog never renders a
 * row of empty grey wells while the club is still gathering pictures.
 *
 * The bundled files are stand-ins, chosen to match the club's indoor,
 * silica-sand courts — they are not a claim about any particular room, and the
 * first upload through the admin console replaces them.
 */
const BUNDLED_PHOTOS: Readonly<Record<string, string>> = {
  'court-01': '/courts/court-01.jpg',
  'court-02': '/courts/court-02.jpg',
  'court-03': '/courts/court-03.jpg',
  'court-04': '/courts/court-04.jpg',
}

/** A slug that is not in the map still gets a photo rather than a blank well. */
const DEFAULT_PHOTO = '/courts/court-01.jpg'

export function courtPhoto(court: Pick<Court, 'slug' | 'heroImageUrl'>): string {
  return court.heroImageUrl ?? BUNDLED_PHOTOS[court.slug] ?? DEFAULT_PHOTO
}
