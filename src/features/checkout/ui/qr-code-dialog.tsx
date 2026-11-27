'use client'

import { useEffect, useId, useRef, useState } from 'react'

/**
 * The payment QR, opened at a size a phone camera can actually read.
 *
 * A guest usually pays with the same phone they are booking on, so the code is
 * scanned from a second screen — and a code scaled to fit a card is a code the
 * second phone has to be held very close to. The button opens the same image
 * large instead of making every guest scroll past a big square.
 *
 * Hand-rolled rather than pulled from a library: it is one panel, and the
 * closing behaviour a guest expects — Escape, the backdrop, the Close button —
 * is a dozen lines.
 */

export type QrCodeDialogProps = {
  /** The method's name, used for the heading and for the image's alt text. */
  readonly label: string
  readonly imageUrl: string
}

export function QrCodeDialog({ label, imageUrl }: QrCodeDialogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    // Focus moves into the dialog, and back to the button that opened it: the
    // guest was mid-form, and losing their place is worse than the dialog.
    const opener = document.activeElement
    closeRef.current?.focus()

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

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="mt-3 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[10px] border border-navy bg-surface px-4 text-[13.5px] font-bold text-navy hover:bg-lime-soft"
      >
        <QrGlyph />
        View QR code
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* A real button rather than a click handler on the backdrop, so the
              full-screen "tap outside to close" is also announced. */}
          <button
            type="button"
            aria-label="Close QR code"
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 cursor-default bg-navy/60"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative w-full max-w-[380px] rounded-[18px] border border-line bg-surface p-5 text-center"
          >
            <h2 id={titleId} className="text-[17px] font-bold text-ink">
              Scan to pay with {label}
            </h2>

            {/* The code itself is never recoloured or cropped: a themed QR that
                still scans is worth more than one that matches the palette. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- the QR is an uploaded remote image */}
            <img
              src={imageUrl}
              alt={`${label} QR code`}
              className="mx-auto mt-4 aspect-square w-full max-w-[300px] rounded-[12px] border border-line bg-white object-contain p-2"
            />

            <p className="mt-3 text-[13px] text-muted">
              Scan this with your banking app, or use the account details above.
            </p>

            <button
              ref={closeRef}
              type="button"
              onClick={() => setIsOpen(false)}
              className="mt-4 min-h-[44px] w-full rounded-[10px] bg-navy px-4 text-[14px] font-bold text-white"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}

function QrGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-4 flex-none"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M14 14h3v3h-3zM20 20h1M20 14v3" />
    </svg>
  )
}
