'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import type { PaymentLine } from '../view/bookings'
import type { Result } from '@/lib/api/result'

/**
 * The guest's proof of payment, opened from the ledger row.
 *
 * The desk reconciles transfers from the list, so the photograph it is checking
 * against the amount has to be reachable from the list. The row used to carry
 * only the word "Proof", which meant opening the booking — and leaving the
 * ledger — to find out whether the money had been sent at all.
 *
 * The image is fetched when the button is pressed, not while the ledger
 * renders: proofs sit in a private bucket, so every one of them costs a signed
 * link, and a month of bookings is a month of links for images that mostly stay
 * closed. The dialog does not navigate either, so a booking being checked is
 * still in front of the staff member when it closes.
 */

export interface PaymentProofButtonProps {
  readonly bookingId: string
  /** Printed in the dialog's heading, so the proof belongs to the row it is on. */
  readonly reference: string
  readonly onLoad: (payload: unknown) => Promise<Result<readonly PaymentLine[]>>
  /** `sm` in a ledger row, `md` where there is room for it. */
  readonly size?: 'sm' | 'md'
}

export function PaymentProofButton({
  bookingId,
  reference,
  onLoad,
  size = 'sm',
}: PaymentProofButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [proofs, setProofs] = useState<readonly PaymentLine[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    // Focus moves into the dialog and comes back to the row it was opened from,
    // so a keyboard user is not dropped at the top of a table of bookings.
    const opener = document.activeElement
    dialogRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)

      if (opener instanceof HTMLElement) {
        opener.focus()
      }
    }
  }, [isOpen])

  function open(): void {
    setIsOpen(true)
    setProofs(null)
    setError(null)

    startTransition(async () => {
      const result = await onLoad({ bookingId })

      if (!result.success) {
        setError(result.error)
        return
      }

      setProofs(result.data)
    })
  }

  return (
    <>
      <Button
        variant="secondary"
        size={size}
        aria-label={`Show payment proof ${reference}`}
        /* A thumb, not a cursor, on a phone: the ledger's own rows are tapped
           at the counter. */
        className="max-sm:h-10"
        onClick={open}
      >
        Proof
      </Button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* A real button, so "tap outside to close" is announced too. */}
          <button
            type="button"
            aria-label="Close the payment proof"
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 cursor-default bg-navy/60"
          />

          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="relative max-h-[85vh] w-full max-w-[440px] overflow-y-auto rounded-[18px] border border-line bg-surface p-5 focus-visible:outline-none"
          >
            <h2 id={titleId} className="m-0 text-[17px] font-bold text-ink">
              Payment proof · {reference}
            </h2>

            <ProofContent
              proofs={proofs}
              error={error}
              isPending={isPending}
              reference={reference}
            />

            <div className="mt-4 flex justify-end">
              <Button variant="secondary" onClick={() => setIsOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

interface ProofContentProps {
  readonly proofs: readonly PaymentLine[] | null
  readonly error: string | null
  readonly isPending: boolean
  readonly reference: string
}

/**
 * Four outcomes, and they are not the same thing: a proof being signed, one
 * that opens, one on file whose link could not be produced (the storage secret
 * is missing), and a booking whose guest never sent anything.
 */
function ProofContent({ proofs, error, isPending, reference }: ProofContentProps) {
  if (error) {
    return (
      <p role="alert" className="mt-3 mb-0 text-[13px] font-semibold text-danger">
        {error}
      </p>
    )
  }

  if (isPending || proofs === null) {
    return <p className="mt-3 mb-0 text-[13.5px] text-muted">Opening the proof…</p>
  }

  if (proofs.length === 0) {
    return (
      <p className="mt-3 mb-0 text-[13.5px] text-muted">No proof was uploaded for this booking.</p>
    )
  }

  return (
    <ul aria-label="Payment proofs" className="mt-3 mb-0 flex list-none flex-col gap-3 p-0">
      {proofs.map((proof) => (
        <li key={proof.id} className="rounded-[11px] bg-surface-alt px-3.5 py-3">
          {proof.proofHref ? (
            <a
              href={proof.proofHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-start gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-mid"
            >
              <Image
                src={proof.proofHref}
                alt={`Proof uploaded for ${reference}`}
                width={640}
                height={460}
                /* Signed URLs expire and are private; the optimiser's on-disk
                   cache must not keep a copy of someone's banking app. */
                unoptimized
                className="h-auto max-h-[320px] w-auto max-w-full rounded-lg border border-line bg-white object-contain"
              />
              <span className="text-[13px] font-semibold text-olive underline">Open full size</span>
            </a>
          ) : (
            <p className="m-0 text-[13px] font-semibold text-danger">
              {proof.proofError ?? 'That proof could not be opened.'}
            </p>
          )}

          <p className="mt-2 mb-0 text-[12.5px] font-semibold text-slate">
            {proof.method} · {proof.amount}
          </p>
        </li>
      ))}
    </ul>
  )
}
