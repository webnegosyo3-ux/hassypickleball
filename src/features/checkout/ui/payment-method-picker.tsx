'use client'

import type { CheckoutPaymentMethod } from '../view/payment-method'

/**
 * How the guest says they will pay, and where to send it.
 *
 * The instructions for the chosen method are shown inline rather than all at
 * once: a guest reading three account numbers at the moment of paying is a
 * guest about to send money to the wrong one.
 *
 * Built from real radios in a fieldset rather than styled buttons, so the
 * arrow-key behaviour and the group label come from the platform.
 */

export type PaymentMethodPickerProps = {
  readonly methods: readonly CheckoutPaymentMethod[]
  readonly selectedId: string | null
  readonly onSelect: (id: string) => void
}

function Detail({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</dt>
      <dd className="text-[15px] font-bold tabular-nums text-ink">{value}</dd>
    </div>
  )
}

function Instructions({ method }: { readonly method: CheckoutPaymentMethod }) {
  const hasAccount = method.accountName !== null || method.accountNumber !== null

  return (
    <div className="mt-3 rounded-[12px] border border-lime-deep bg-lime-soft p-4">
      {hasAccount ? (
        <dl className="flex flex-col gap-1.5">
          {method.accountName ? <Detail label="Account name" value={method.accountName} /> : null}
          {method.accountNumber ? <Detail label="Number" value={method.accountNumber} /> : null}
        </dl>
      ) : null}

      {method.instructions ? (
        <p className={`text-[13.5px] leading-relaxed text-slate ${hasAccount ? 'mt-3' : ''}`}>
          {method.instructions}
        </p>
      ) : null}

      {method.qrImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={method.qrImageUrl}
          alt={`${method.label} QR code`}
          className="mt-3 h-40 w-40 rounded-[10px] border border-line bg-surface object-contain"
        />
      ) : null}
    </div>
  )
}

export function PaymentMethodPicker({ methods, selectedId, onSelect }: PaymentMethodPickerProps) {
  return (
    <fieldset className="border-0 p-0">
      <legend className="text-[12px] font-bold uppercase tracking-[0.12em] text-olive">
        How will you pay?
      </legend>

      <div className="mt-3 flex flex-col gap-2">
        {methods.map((method) => {
          const isSelected = method.id === selectedId

          return (
            <div key={method.id}>
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-[11px] border px-3.5 py-3 ${
                  isSelected ? 'border-lime-deep bg-lime-soft' : 'border-line bg-surface'
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value={method.id}
                  checked={isSelected}
                  onChange={() => onSelect(method.id)}
                  className="size-4 accent-navy"
                />
                <span className="text-[14px] font-semibold text-ink">{method.label}</span>
              </label>

              {isSelected ? <Instructions method={method} /> : null}
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}
