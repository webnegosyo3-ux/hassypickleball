import 'server-only'

import { createPricingRuleSchema, pricingRulePatchSchema } from '@/lib/api/admin-schemas'
import { invalid, withStaff } from './session'
import {
  upsertPricingRule,
  deletePricingRule,
  listAllPricingRules,
} from '@/lib/repositories/pricing-rules'
import type { PricingRule } from '@/lib/domain/types'
import type { Result } from '@/lib/api/result'
import { ok } from '@/lib/api/result'

/**
 * Save (create or update) a pricing rule.
 *
 * The presence of an `id` decides create vs. update, matching the court and
 * product editors. Validation is owned by the schemas; the server action is
 * the thin gate that also stamps the clubId from the session.
 */
export async function savePricingRule(input: unknown): Promise<Result<PricingRule>> {
  const hasId =
    typeof input === 'object' && input !== null && 'id' in input

  if (hasId) {
    const parsed = pricingRulePatchSchema.safeParse(input)

    if (!parsed.success) {
      return invalid(parsed.error.issues[0]?.message ?? 'Check the pricing rule details')
    }

    const { id, ...patch } = parsed.data

    return withStaff(async ({ staff, client }) => {
      const rule = await upsertPricingRule(client, staff.clubId, id, {
        label: patch.label ?? '',
        startsAtTime: patch.startsAtTime ?? null,
        endsAtTime: patch.endsAtTime ?? null,
        daysOfWeek: patch.daysOfWeek ?? [],
        kind: patch.kind ?? 'fixed',
        valueCents: patch.valueCents ?? null,
        valuePercent: patch.valuePercent ?? null,
        priority: patch.priority ?? 0,
        isActive: patch.isActive ?? true,
      })
      return rule
    })
  }

  const parsed = createPricingRuleSchema.safeParse(input)

  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message ?? 'Check the pricing rule details')
  }

  return withStaff(async ({ staff, client }) => {
    const rule = await upsertPricingRule(client, staff.clubId, undefined, {
      label: parsed.data.label,
      startsAtTime: parsed.data.startsAtTime ?? null,
      endsAtTime: parsed.data.endsAtTime ?? null,
      daysOfWeek: parsed.data.daysOfWeek,
      kind: parsed.data.kind,
      valueCents: parsed.data.valueCents ?? null,
      valuePercent: parsed.data.valuePercent ?? null,
      priority: parsed.data.priority,
      isActive: parsed.data.isActive,
    })
    return rule
  })
}

export async function removePricingRule(
  input: unknown,
): Promise<Result<{ id: string }>> {
  const parsed =
    typeof input === 'object' && input !== null && 'id' in input
      ? { success: true as const, data: input as { id: string } }
      : { success: false as const }

  if (!parsed.success) {
    return invalid('Missing rule id')
  }

  return withStaff(async ({ staff, client }) => {
    await deletePricingRule(client, staff.clubId, parsed.data.id)
    return ok({ id: parsed.data.id })
  }) as Promise<Result<{ id: string }>>
}

export { listAllPricingRules }
