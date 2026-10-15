import { loadConsole } from '../console-data'
import { SettingsScreen } from '@/features/admin/ui/settings-screen'
import { saveClubSettingsAction } from '@/features/admin/actions'

/** Club-wide details the storefront shows: name, hours, desk phone, booking rules. */
export default async function AdminSettingsPage() {
  const { club, staff } = await loadConsole()

  return (
    <SettingsScreen club={club} canEdit={staff.role === 'admin'} onSave={saveClubSettingsAction} />
  )
}
