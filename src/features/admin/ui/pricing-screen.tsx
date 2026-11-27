'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  AdminPageHeader,
  AdminScreen,
  CARD,
  Cell,
  DataTable,
  EmptyState,
  FullWidthRow,
  Row,
  TABLE_SHELL,
} from './primitives'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/format/money'
import type { PricingRule } from '@/lib/domain/types'
import type { Result } from '@/lib/api/result'

/**
 * Pricing rules: the time-of-day and day-of-week overrides that sit on top of
 * each court's base price. The morning rate is the most common adjustment —
 * a discounted AM window to fill courts that would otherwise sit empty until
 * the after-work rush.
 *
 * Rules are listed by priority. Each row can be edited inline.
 * The "Add rule" button opens a blank editor above the list.
 */

export interface PricingScreenProps {
  readonly rules: readonly PricingRule[]
  readonly currency: string
  readonly onSave: (payload: unknown) => Promise<Result<PricingRule>>
  readonly onRemove: (payload: unknown) => Promise<Result<{ id: string }>>
}

const COLUMNS = ['Label', 'Time window', 'Days', 'Kind', 'Value', 'Status', ''] as const

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const KIND_LABELS: Record<string, string> = {
  fixed: 'Fixed price',
  amount_delta: 'Amount ±',
  percent_delta: 'Percent ±',
}

const SAVE_FAILURE_MESSAGE = 'We could not save that change. Please try again.'

type EditTarget = string | 'new' | null

function formatDays(days: readonly number[]): string {
  if (days.length === 0) return 'Every day'
  if (days.length === 7) return 'Every day'
  return days.map((d) => DAY_LABELS[d] ?? '?').join(', ')
}

function formatValue(rule: PricingRule, currency: string): string {
  if (rule.kind === 'percent_delta') {
    const v = rule.valuePercent ?? 0
    return `${v >= 0 ? '+' : ''}${v}%`
  }
  if (rule.kind === 'amount_delta') {
    const v = rule.valueCents ?? 0
    return `${v >= 0 ? '+' : '-'}${formatMoney(Math.abs(v), currency)}`
  }
  return formatMoney(rule.valueCents ?? 0, currency)
}

function formatTimeWindow(rule: PricingRule): string {
  if (!rule.startsAtTime && !rule.endsAtTime) return 'All day'
  const from = rule.startsAtTime?.slice(0, 5) ?? '—'
  const to = rule.endsAtTime?.slice(0, 5) ?? '—'
  return `${from} – ${to}`
}

export function PricingScreen({ rules, currency, onSave, onRemove }: PricingScreenProps) {
  const router = useRouter()
  const [editing, setEditing] = useState<EditTarget>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSaved(): void {
    setEditing(null)
    router.refresh()
  }

  function toggleActive(rule: PricingRule): void {
    setError(null)
    startTransition(async () => {
      try {
        const result = await onSave({ id: rule.id, isActive: !rule.isActive })
        if (!result.success) {
          setError(result.error)
          return
        }
        router.refresh()
      } catch {
        setError(SAVE_FAILURE_MESSAGE)
      }
    })
  }

  function handleRemove(rule: PricingRule): void {
    if (!confirm(`Delete "${rule.label}"? This cannot be undone.`)) return
    setError(null)
    startTransition(async () => {
      try {
        const result = await onRemove({ id: rule.id })
        if (!result.success) {
          setError(result.error)
          return
        }
        router.refresh()
      } catch {
        setError(SAVE_FAILURE_MESSAGE)
      }
    })
  }

  return (
    <AdminScreen>
      <AdminPageHeader
        title="Pricing"
        subtitle="Time-of-day and day-of-week rates layered over each court's base price"
      >
        <Button onClick={() => setEditing('new')} disabled={editing === 'new'}>
          Add rule
        </Button>
      </AdminPageHeader>

      {error ? (
        <p role="alert" className={`${CARD} mb-4 px-4 py-3 text-[13px] text-danger`}>
          {error}
        </p>
      ) : null}

      {editing === 'new' ? (
        <div className={`${CARD} mb-4`}>
          <PricingRuleEditor
            rule={null}
            currency={currency}
            onSave={onSave}
            onSaved={handleSaved}
            onCancel={() => setEditing(null)}
          />
        </div>
      ) : null}

      <div className={`${TABLE_SHELL} sm:overflow-x-auto`}>
        {rules.length === 0 ? (
          <EmptyState>
            No pricing rules yet. Courts charge their flat base price at all times.
          </EmptyState>
        ) : (
          <DataTable label="Pricing rules" columns={COLUMNS} wideClassName="sm:min-w-[820px]">
            {rules.map((rule) => (
              <PricingRuleRow
                key={rule.id}
                rule={rule}
                currency={currency}
                isPending={isPending}
                isEditing={editing === rule.id}
                onEdit={() => setEditing(rule.id)}
                onToggle={() => toggleActive(rule)}
                onRemove={() => handleRemove(rule)}
                onSave={onSave}
                onSaved={handleSaved}
                onCancel={() => setEditing(null)}
              />
            ))}
          </DataTable>
        )}
      </div>
    </AdminScreen>
  )
}

interface PricingRuleRowProps {
  readonly rule: PricingRule
  readonly currency: string
  readonly isPending: boolean
  readonly isEditing: boolean
  readonly onEdit: () => void
  readonly onToggle: () => void
  readonly onRemove: () => void
  readonly onSave: PricingScreenProps['onSave']
  readonly onSaved: () => void
  readonly onCancel: () => void
}

function PricingRuleRow({
  rule,
  currency,
  isPending,
  isEditing,
  onEdit,
  onToggle,
  onRemove,
  onSave,
  onSaved,
  onCancel,
}: PricingRuleRowProps) {
  return (
    <>
      <Row>
        <Cell label="Label" mobile="title">
          <span className="block font-semibold">{rule.label}</span>
          <span className="mt-px block text-[12.5px] font-normal text-subtle">
            Priority {rule.priority}
          </span>
        </Cell>
        <Cell label="Time window" mobile="lead" className="text-slate">
          {formatTimeWindow(rule)}
        </Cell>
        <Cell label="Days" className="text-slate">
          {formatDays(rule.daysOfWeek)}
        </Cell>
        <Cell label="Kind" className="text-slate">
          {KIND_LABELS[rule.kind] ?? rule.kind}
        </Cell>
        <Cell label="Value" mobile="trailing" className="text-slate tabular-nums font-semibold">
          {formatValue(rule, currency)}
        </Cell>
        <Cell label="Status" mobile="badge">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase ${
              rule.isActive ? 'bg-success-bg text-success' : 'bg-surface-sunken text-muted'
            }`}
          >
            {rule.isActive ? 'Active' : 'Inactive'}
          </span>
        </Cell>
        <Cell label="" mobile="actions">
          <div className="flex justify-end gap-2 max-sm:grid max-sm:grid-cols-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={onEdit}
              disabled={isEditing}
              className="max-sm:h-11 max-sm:text-sm"
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggle}
              disabled={isPending}
              className="max-sm:h-11 max-sm:border max-sm:border-line-strong max-sm:text-sm"
            >
              {rule.isActive ? 'Disable' : 'Enable'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRemove}
              disabled={isPending}
              className="max-sm:col-span-2 max-sm:h-11 max-sm:text-sm text-danger"
            >
              Delete
            </Button>
          </div>
        </Cell>
      </Row>

      {isEditing ? (
        <FullWidthRow columnCount={COLUMNS.length}>
          <PricingRuleEditor
            rule={rule}
            currency={currency}
            onSave={onSave}
            onSaved={onSaved}
            onCancel={onCancel}
          />
        </FullWidthRow>
      ) : null}
    </>
  )
}

// ─── Editor ──────────────────────────────────────────────────────────────────

type RuleKind = 'fixed' | 'amount_delta' | 'percent_delta'

type EditorForm = {
  label: string
  startsAtTime: string
  endsAtTime: string
  daysOfWeek: number[]
  kind: RuleKind
  valueCents: string
  valuePercent: string
  priority: string
  isActive: boolean
}

function toEditorForm(rule: PricingRule | null): EditorForm {
  if (!rule) {
    return {
      label: 'Morning rate',
      startsAtTime: '06:00',
      endsAtTime: '12:00',
      daysOfWeek: [],
      kind: 'percent_delta',
      valueCents: '0',
      valuePercent: '-20',
      priority: '5',
      isActive: true,
    }
  }
  return {
    label: rule.label,
    startsAtTime: rule.startsAtTime?.slice(0, 5) ?? '',
    endsAtTime: rule.endsAtTime?.slice(0, 5) ?? '',
    daysOfWeek: [...rule.daysOfWeek],
    kind: rule.kind,
    valueCents: rule.valueCents != null ? String(rule.valueCents / 100) : '0',
    valuePercent: rule.valuePercent != null ? String(rule.valuePercent) : '0',
    priority: String(rule.priority),
    isActive: rule.isActive,
  }
}

function toPayload(form: EditorForm, id?: string) {
  const base = {
    ...(id ? { id } : {}),
    label: form.label,
    startsAtTime: form.startsAtTime || null,
    endsAtTime: form.endsAtTime || null,
    daysOfWeek: form.daysOfWeek,
    kind: form.kind,
    valueCents:
      form.kind !== 'percent_delta' ? Math.round(parseFloat(form.valueCents) * 100) : null,
    valuePercent: form.kind === 'percent_delta' ? parseFloat(form.valuePercent) : null,
    priority: parseInt(form.priority, 10) || 0,
    isActive: form.isActive,
  }
  return base
}

const FIELD =
  'h-11 rounded-xl border border-line-strong bg-surface px-3 text-[15px] text-ink sm:h-10 sm:text-[14px] ' +
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-navy-mid'
const LABEL = 'text-[13px] font-semibold text-ink'
const SAVE_FAILURE = 'We could not save that change. Please try again.'

interface PricingRuleEditorProps {
  readonly rule: PricingRule | null
  readonly currency: string
  readonly onSave: (payload: unknown) => Promise<Result<PricingRule>>
  readonly onSaved: () => void
  readonly onCancel: () => void
}

export function PricingRuleEditor({
  rule,
  currency,
  onSave,
  onSaved,
  onCancel,
}: PricingRuleEditorProps) {
  const [form, setForm] = useState<EditorForm>(() => toEditorForm(rule))
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const prefix = useId()

  function update<K extends keyof EditorForm>(key: K, value: EditorForm[K]): void {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function toggleDay(day: number): void {
    setForm((current) => ({
      ...current,
      daysOfWeek: current.daysOfWeek.includes(day)
        ? current.daysOfWeek.filter((d) => d !== day)
        : [...current.daysOfWeek, day].sort((a, b) => a - b),
    }))
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    setError(null)

    startTransition(async () => {
      try {
        const payload = toPayload(form, rule?.id)
        const result = await onSave(payload)
        if (!result.success) {
          setError(result.error)
          return
        }
        onSaved()
      } catch {
        setError(SAVE_FAILURE)
      }
    })
  }

  const id = (suffix: string) => `${prefix}-${suffix}`

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
      {/* Label */}
      <FieldWrap id={id('label')} label="Rule label" className="sm:col-span-2">
        <input
          id={id('label')}
          value={form.label}
          onChange={(e) => update('label', e.target.value)}
          required
          maxLength={120}
          className={FIELD}
        />
      </FieldWrap>

      {/* Time window */}
      <FieldWrap
        id={id('starts')}
        label="Start time (AM price begins)"
        hint="Leave blank for all-day rule."
      >
        <input
          id={id('starts')}
          type="time"
          value={form.startsAtTime}
          onChange={(e) => update('startsAtTime', e.target.value)}
          className={FIELD}
        />
      </FieldWrap>

      <FieldWrap
        id={id('ends')}
        label="End time (AM price ends)"
        hint="Leave blank for all-day rule."
      >
        <input
          id={id('ends')}
          type="time"
          value={form.endsAtTime}
          onChange={(e) => update('endsAtTime', e.target.value)}
          className={FIELD}
        />
      </FieldWrap>

      {/* Days of week */}
      <FieldWrap id={id('days')} label="Days (leave empty = every day)" className="sm:col-span-2">
        <div className="flex flex-wrap gap-2">
          {DAY_LABELS.map((dayLabel, i) => (
            <label key={i} className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={form.daysOfWeek.includes(i)}
                onChange={() => toggleDay(i)}
                className="size-4 accent-navy-mid"
              />
              <span className="text-[13px] text-ink">{dayLabel}</span>
            </label>
          ))}
        </div>
      </FieldWrap>

      {/* Kind */}
      <FieldWrap id={id('kind')} label="Rate kind">
        <select
          id={id('kind')}
          value={form.kind}
          onChange={(e) => update('kind', e.target.value as RuleKind)}
          className={FIELD}
        >
          <option value="fixed">Fixed price (replace base price)</option>
          <option value="amount_delta">Amount change (add/subtract {currency})</option>
          <option value="percent_delta">Percent change (add/subtract %)</option>
        </select>
      </FieldWrap>

      {/* Value */}
      {form.kind === 'percent_delta' ? (
        <FieldWrap
          id={id('valuePct')}
          label="Percent change (%)"
          hint="Use negative for a discount, e.g. -20 for 20% off."
        >
          <input
            id={id('valuePct')}
            value={form.valuePercent}
            onChange={(e) => update('valuePercent', e.target.value)}
            required
            inputMode="decimal"
            className={FIELD}
          />
        </FieldWrap>
      ) : (
        <FieldWrap
          id={id('valueCents')}
          label={`Amount (${currency})`}
          hint={
            form.kind === 'amount_delta'
              ? 'Use negative for a discount, e.g. -100 for ₱100 off.'
              : 'Fixed price per hour to charge instead of the base price.'
          }
        >
          <input
            id={id('valueCents')}
            value={form.valueCents}
            onChange={(e) => update('valueCents', e.target.value)}
            required
            inputMode="decimal"
            className={FIELD}
          />
        </FieldWrap>
      )}

      {/* Priority */}
      <FieldWrap id={id('priority')} label="Priority" hint="Lower numbers apply first. Use 0–999.">
        <input
          id={id('priority')}
          value={form.priority}
          onChange={(e) => update('priority', e.target.value)}
          inputMode="numeric"
          className={FIELD}
        />
      </FieldWrap>

      {/* Active toggle */}
      <label className="flex items-center gap-2.5 self-end">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(e) => update('isActive', e.target.checked)}
          className="size-4"
        />
        <span className={LABEL}>Active</span>
      </label>

      {error ? (
        <p role="alert" className="m-0 text-[13px] text-danger sm:col-span-2">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2.5 sm:col-span-2">
        <Button type="submit" isPending={isPending}>
          Save rule
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function FieldWrap({
  id,
  label,
  hint,
  className = '',
  children,
}: {
  readonly id: string
  readonly label: string
  readonly hint?: string
  readonly className?: string
  readonly children: React.ReactNode
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      {children}
      {hint ? <p className="m-0 text-[12px] text-subtle">{hint}</p> : null}
    </div>
  )
}
