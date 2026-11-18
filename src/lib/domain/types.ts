/** Shared domain vocabulary. Mirrors the enums declared in the migrations. */

export type CustomerTier = 'standard' | 'regular' | 'pro'

export type RateKind = 'fixed' | 'amount_delta' | 'percent_delta'

export type BookingStatus = 'pending' | 'awaiting_payment' | 'confirmed' | 'cancelled' | 'completed'

/** A half-open interval [startsAt, endsAt). */
export type TimeRange = {
  readonly startsAt: Date
  readonly endsAt: Date
}

export type PricingRule = {
  readonly id: string
  readonly label: string
  /** Null means the rule applies to every court in the club. */
  readonly courtId: string | null
  /** Empty means every day. 0 = Sunday, matching Postgres `dow`. */
  readonly daysOfWeek: readonly number[]
  /** Club-local "HH:MM" bounds, or null for all day. */
  readonly startsAtTime: string | null
  readonly endsAtTime: string | null
  readonly minDurationMinutes: number | null
  readonly appliesToTier: CustomerTier | null
  readonly kind: RateKind
  readonly valueCents: number | null
  readonly valuePercent: number | null
  readonly priority: number
  readonly isActive: boolean
}

export type CourtSelection = {
  readonly courtId: string
  readonly startsAt: Date
  readonly endsAt: Date
  readonly priceCents: number
}

export type CartItem = {
  readonly productId: string
  readonly name: string
  readonly unitPriceCents: number
  readonly quantity: number
}
