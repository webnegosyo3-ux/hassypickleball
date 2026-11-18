import { loadConsole } from '../console-data'
import { PricingScreen } from '@/features/admin/ui/pricing-screen'
import { savePricingRuleAction, removePricingRuleAction } from '@/features/admin/actions'
import { listAllPricingRules } from '@/lib/repositories/pricing-rules'

/** Pricing rules: time-of-day and day-of-week rates layered over court base prices. */
export default async function AdminPricingPage() {
  const { client, club } = await loadConsole()
  const rules = await listAllPricingRules(client, club.id)

  return (
    <PricingScreen
      rules={rules}
      currency={club.currency}
      onSave={savePricingRuleAction}
      onRemove={removePricingRuleAction}
    />
  )
}
