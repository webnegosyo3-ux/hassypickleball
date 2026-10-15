'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { AdminPageHeader, AdminScreen, CARD } from './primitives'
import type { Result } from '@/lib/api/result'
import type { Club } from '@/lib/repositories/mappers'

export interface SettingsScreenProps {
  readonly club: Club
  /** Only admins can write `clubs`; plain staff see the values read-only. */
  readonly canEdit: boolean
  readonly onSave: (payload: unknown) => Promise<Result<Club>>
}

const FIELD =
  'h-10 rounded-xl border border-line-strong bg-surface px-3 text-[14px] text-ink ' +
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-navy-mid ' +
  'disabled:bg-surface-alt disabled:text-muted'
const AREA = FIELD.replace('h-10', 'min-h-24 py-2')
const LABEL = 'text-[13px] font-semibold text-ink'

/** Postgres returns "06:00:00"; a time input wants "06:00". */
const toTimeInput = (time: string) => time.slice(0, 5)

type FormState = {
  name: string
  phone: string
  opensAt: string
  closesAt: string
  slotMinutes: string
  minDurationMinutes: string
  maxDurationMinutes: string
  cancellationWindowHours: string
  groupBookingNote: string
}

function toFormState(club: Club): FormState {
  return {
    name: club.name,
    phone: club.phone ?? '',
    opensAt: toTimeInput(club.opensAt),
    closesAt: toTimeInput(club.closesAt),
    slotMinutes: String(club.slotMinutes),
    minDurationMinutes: String(club.minDurationMinutes),
    maxDurationMinutes: String(club.maxDurationMinutes),
    cancellationWindowHours: String(club.cancellationWindowHours),
    groupBookingNote: club.groupBookingNote ?? '',
  }
}

export function SettingsScreen({ club, canEdit, onSave }: SettingsScreenProps) {
  const router = useRouter()
  const prefix = useId()
  const [form, setForm] = useState<FormState>(() => toFormState(club))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  function update<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setSaved(false)
    setForm((current) => ({ ...current, [key]: value }))
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    setError(null)
    setSaved(false)

    startTransition(async () => {
      const result = await onSave({
        name: form.name,
        phone: form.phone,
        opensAt: form.opensAt,
        closesAt: form.closesAt,
        slotMinutes: Number(form.slotMinutes),
        minDurationMinutes: Number(form.minDurationMinutes),
        maxDurationMinutes: Number(form.maxDurationMinutes),
        cancellationWindowHours: Number(form.cancellationWindowHours),
        groupBookingNote: form.groupBookingNote,
      })

      if (!result.success) {
        setError(result.error)
        return
      }

      setForm(toFormState(result.data))
      setSaved(true)
      router.refresh()
    })
  }

  const field = (key: keyof FormState) => ({
    id: `${prefix}-${key}`,
    value: form[key],
    disabled: !canEdit,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
    ) => update(key, event.target.value),
  })

  return (
    <AdminScreen>
      <AdminPageHeader
        title="Settings"
        subtitle="Club details and booking rules shown across the website"
      />

      <form onSubmit={handleSubmit} className={`${CARD} grid gap-4 p-5 sm:grid-cols-2`}>
        {!canEdit ? (
          <p className="m-0 text-[13px] text-muted sm:col-span-2">
            Only an administrator can change these settings.
          </p>
        ) : null}

        <Field id={`${prefix}-name`} label="Club name" hint="Shown in the header, footer and emails.">
          <input {...field('name')} required maxLength={120} className={FIELD} />
        </Field>

        <Field id={`${prefix}-phone`} label="Desk phone" hint="Shown on court pages.">
          <input {...field('phone')} type="tel" maxLength={40} className={FIELD} />
        </Field>

        <Field id={`${prefix}-opensAt`} label="Opens at">
          <input {...field('opensAt')} type="time" required className={FIELD} />
        </Field>

        <Field id={`${prefix}-closesAt`} label="Closes at">
          <input {...field('closesAt')} type="time" required className={FIELD} />
        </Field>

        <Field id={`${prefix}-slotMinutes`} label="Booking slot length">
          <select {...field('slotMinutes')} className={FIELD}>
            <option value="15">15 minutes</option>
            <option value="30">30 minutes</option>
            <option value="60">60 minutes</option>
          </select>
        </Field>

        <Field
          id={`${prefix}-cancellationWindowHours`}
          label="Free cancellation window (hours)"
          hint="Hours before start that a guest can still cancel free of charge."
        >
          <input
            {...field('cancellationWindowHours')}
            type="number"
            min={0}
            max={168}
            required
            className={FIELD}
          />
        </Field>

        <Field id={`${prefix}-minDurationMinutes`} label="Shortest booking (minutes)">
          <input
            {...field('minDurationMinutes')}
            type="number"
            min={15}
            step={15}
            required
            className={FIELD}
          />
        </Field>

        <Field id={`${prefix}-maxDurationMinutes`} label="Longest booking (minutes)">
          <input
            {...field('maxDurationMinutes')}
            type="number"
            min={15}
            step={15}
            required
            className={FIELD}
          />
        </Field>

        <Field
          id={`${prefix}-groupBookingNote`}
          label="Group booking note"
          hint="Shown on court pages, e.g. how to book for leagues or events."
          className="sm:col-span-2"
        >
          <textarea {...field('groupBookingNote')} maxLength={1000} className={AREA} />
        </Field>

        {error ? (
          <p role="alert" className="m-0 text-[13px] text-danger sm:col-span-2">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p role="status" className="m-0 text-[13px] font-semibold text-olive sm:col-span-2">
            Settings saved.
          </p>
        ) : null}

        {canEdit ? (
          <div className="sm:col-span-2">
            <Button type="submit" isPending={isPending}>
              Save settings
            </Button>
          </div>
        ) : null}
      </form>
    </AdminScreen>
  )
}

function Field({
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
