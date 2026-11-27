'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import type { Result } from '@/lib/api/result'

/**
 * Deleting a booking, asked once and asked properly.
 *
 * Cancelling is what the desk does to a booking that will not happen: it keeps
 * the record and the money trail. This is for the rows that should never have
 * existed, and it takes the payments with it — so the button only opens the
 * question, names the booking, and says what goes.
 *
 * The question is a dialog rather than an inline reveal because the same button
 * sits in a table cell and on the booking's own page, and a confirmation wide
 * enough to be read inside a 110px column would push the ledger sideways.
 */

export interface DeleteBookingButtonProps {
  readonly bookingId: string
  /** Printed in the confirmation, so the desk deletes the one it meant. */
  readonly reference: string
  readonly onDelete: (payload: unknown) => Promise<Result<unknown>>
  /** Fired once the row is gone: the list refreshes, the detail page leaves. */
  readonly onDeleted: () => void
  /** `sm` in a ledger row, `md` on the booking's own page. */
  readonly size?: 'sm' | 'md'
}

export function DeleteBookingButton({
  bookingId,
  reference,
  onDelete,
  onDeleted,
  size = 'md',
}: DeleteBookingButtonProps) {
  const [isAsking, setIsAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isAsking) {
      return
    }

    // Focus moves into the dialog and back to the button that opened it: the
    // first control in a destructive prompt must not be a live Delete.
    const opener = document.activeElement
    dialogRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsAsking(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)

      if (opener instanceof HTMLElement) {
        opener.focus()
      }
    }
  }, [isAsking])

  function remove(): void {
    setError(null)

    startTransition(async () => {
      const result = await onDelete({ bookingId })

      if (!result.success) {
        setError(result.error)
        return
      }

      setIsAsking(false)
      onDeleted()
    })
  }

  return (
    <>
      <Button
        variant="danger"
        size={size}
        aria-label={`Delete ${reference}`}
        onClick={() => setIsAsking(true)}
      >
        Delete
      </Button>

      {isAsking ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* A real button, so "tap outside to close" is announced too. */}
          <button
            type="button"
            aria-label="Close and keep the booking"
            onClick={() => setIsAsking(false)}
            className="absolute inset-0 cursor-default bg-navy/60"
          />

          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="relative w-full max-w-[400px] rounded-[18px] border border-line bg-surface p-5 focus-visible:outline-none"
          >
            <h2 id={titleId} className="m-0 text-[17px] font-bold text-ink">
              Delete {reference}?
            </h2>

            <p className="mt-2 mb-0 text-[13.5px] leading-relaxed text-slate">
              The booking goes with its payments, players, and court holds. This cannot be undone —
              cancel it instead if the record still matters.
            </p>

            {error ? (
              <p role="alert" className="mt-3 mb-0 text-[13px] font-semibold text-danger">
                {error}
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap justify-end gap-2.5">
              <Button variant="secondary" isPending={isPending} onClick={() => setIsAsking(false)}>
                Keep it
              </Button>
              <Button variant="danger" isPending={isPending} onClick={remove}>
                Delete booking
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
