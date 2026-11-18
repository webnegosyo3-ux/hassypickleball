import 'server-only'

import { toPricingRule } from './mappers'
import { raise, type Client } from './support'
import type { PricingRule } from '@/lib/domain/types'

/**
 * Pricing rules, read for quoting and now also managed via the admin console.
 *
 * Every quote path (availability, create-booking, reschedule) loads the active
 * set and hands it to `quoteCourtSegment`. The console editor writes rules here.
 */

export async function listActivePricingRules(
  client: Client,
  clubId: string,
): Promise<PricingRule[]> {
  const { data, error } = await client
    .from('pricing_rules')
    .select('*')
    .eq('club_id', clubId)
    .eq('is_active', true)
    .order('priority', { ascending: true })

  raise('Failed to load pricing rules', error)

  return (data ?? []).map(toPricingRule)
}

/** All rules for a club (including inactive), for the admin console. */
export async function listAllPricingRules(
  client: Client,
  clubId: string,
): Promise<PricingRule[]> {
  const { data, error } = await client
    .from('pricing_rules')
    .select('*')
    .eq('club_id', clubId)
    .order('priority', { ascending: true })

  raise('Failed to load pricing rules', error)

  return (data ?? []).map(toPricingRule)
}

export type PricingRuleWrite = {
  readonly label: string
  readonly startsAtTime: string | null
  readonly endsAtTime: string | null
  readonly daysOfWeek: number[]
  readonly kind: 'fixed' | 'amount_delta' | 'percent_delta'
  readonly valueCents: number | null
  readonly valuePercent: number | null
  readonly priority: number
  readonly isActive: boolean
}

export async function upsertPricingRule(
  client: Client,
  clubId: string,
  id: string | undefined,
  data: PricingRuleWrite,
): Promise<PricingRule> {
  const row = {
    club_id: clubId,
    label: data.label,
    starts_at_time: data.startsAtTime,
    ends_at_time: data.endsAtTime,
    days_of_week: data.daysOfWeek,
    kind: data.kind,
    value_cents: data.valueCents,
    value_percent: data.valuePercent,
    priority: data.priority,
    is_active: data.isActive,
  }

  if (id) {
    const { data: updated, error } = await client
      .from('pricing_rules')
      .update(row)
      .eq('id', id)
      .eq('club_id', clubId)
      .select()
      .single()

    raise('Failed to update pricing rule', error)
    if (!updated) throw new Error('Pricing rule not found after update')
    return toPricingRule(updated)
  }

  const { data: created, error } = await client
    .from('pricing_rules')
    .insert(row)
    .select()
    .single()

  raise('Failed to create pricing rule', error)
  if (!created) throw new Error('Pricing rule not returned after insert')
  return toPricingRule(created)
}

export async function deletePricingRule(
  client: Client,
  clubId: string,
  id: string,
): Promise<void> {
  const { error } = await client
    .from('pricing_rules')
    .delete()
    .eq('id', id)
    .eq('club_id', clubId)

  raise('Failed to delete pricing rule', error)
}
