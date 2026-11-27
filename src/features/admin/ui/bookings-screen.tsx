'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AdminPageHeader,
  AdminScreen,
  Cell,
  DataTable,
  EmptyState,
  Row,
  TABLE_SHELL,
  type TableColumn,
} from './primitives'
import { DeleteBookingButton } from './delete-booking'
import { PaymentBadge } from './payment-badge'
import { PaymentProofButton } from './payment-proof-dialog'
import { StatusBadge } from '@/components/ui/status-badge'
import {
  bookingTabs,
  filterBookingRows,
  NO_MATCH_MESSAGE,
  type BookingFilterTab,
} from '../view/booking-filters'
import type { BookingRow, PaymentLine } from '../view/bookings'
import type { Result } from '@/lib/api/result'

/**
 * Every booking the club has in the window.
 *
 * This replaced the separate Orders ledger. There was never a second kind of
 * record behind it — orders were these same bookings seen through their
 * payments — and keeping two screens meant staff reconciling a transfer on one
 * and confirming the booking on the other. Both facts now sit on one row.
 *
 * The booking itself opens on its own page, reached by the reference or by
 * Manage. It used to open in a panel beside this table, which left ten columns
 * two thirds of the screen and made the ledger scroll sideways on every
 * desktop; the record now gets the whole page to itself.
 *
 * The search and the tab stay out of the URL: they are how one person is reading
 * the list right now, and putting them in the query string would turn every
 * keystroke into a navigation.
 */

/**
 * Column headings, and where each one sits. The total and the row's actions
 * follow their own content: a left-aligned "Total" over right-aligned pesos
 * read as a broken table rather than as a styled one.
 */
const COLUMNS: readonly TableColumn[] = [
  'Reference',
  'Customer',
  'Court',
  'When',
  'Extras',
  'Status',
  'Method',
  'Payment',
  { label: 'Total', align: 'right' },
  { label: '', align: 'right' },
]

export interface BookingsScreenProps {
  readonly rows: readonly BookingRow[]
  readonly onDelete: (payload: unknown) => Promise<Result<unknown>>
  /**
   * Signs a booking's proofs on demand. Not done while rendering: a month of
   * rows is a month of links to images the desk mostly never opens.
   */
  readonly onLoadProof: (payload: unknown) => Promise<Result<readonly PaymentLine[]>>
}

export function BookingsScreen({ rows, onDelete, onLoadProof }: BookingsScreenProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<BookingFilterTab>('all')

  const tabs = useMemo(() => bookingTabs(rows), [rows])
  const visible = useMemo(() => filterBookingRows(rows, { query, tab }), [rows, query, tab])
  const unpaid = tabs.find((entry) => entry.id === 'awaiting')?.count ?? 0

  return (
    <AdminScreen>
      <AdminPageHeader
        title="Bookings"
        subtitle={`${rows.length} in this window · ${unpaid} awaiting payment`}
      />

      <BookingFilters
        query={query}
        tab={tab}
        tabs={tabs}
        onQueryChange={setQuery}
        onTabChange={setTab}
      />

      <div className={`${TABLE_SHELL} min-w-0 sm:overflow-x-auto`}>
        {rows.length === 0 ? (
          <EmptyState>No bookings in this window yet.</EmptyState>
        ) : visible.length === 0 ? (
          <EmptyState>{NO_MATCH_MESSAGE}</EmptyState>
        ) : (
          <DataTable label="Bookings" columns={COLUMNS} wideClassName="sm:min-w-[1000px]">
            {visible.map((row) => (
              <BookingListRow
                key={row.id}
                row={row}
                onDelete={onDelete}
                onLoadProof={onLoadProof}
                onDeleted={() => router.refresh()}
              />
            ))}
          </DataTable>
        )}
      </div>
    </AdminScreen>
  )
}

const SEARCH_FIELD =
  'h-11 w-full rounded-xl border border-line-strong bg-surface pr-3 pl-10 text-[15px] text-ink ' +
  'placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-offset-1 ' +
  'focus-visible:outline-navy-mid sm:h-10 sm:text-[14px]'

const TAB_BUTTON =
  'inline-flex h-10 flex-none snap-start items-center gap-1.5 rounded-full border px-3.5 ' +
  'text-[13.5px] font-semibold whitespace-nowrap transition ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-mid'

interface BookingFiltersProps {
  readonly query: string
  readonly tab: BookingFilterTab
  readonly tabs: ReturnType<typeof bookingTabs>
  readonly onQueryChange: (value: string) => void
  readonly onTabChange: (value: BookingFilterTab) => void
}

/**
 * The tabs scroll rather than wrap: four pills wrapping onto two lines pushes
 * the first booking off a phone screen before anything has been read.
 */
function BookingFilters({ query, tab, tabs, onQueryChange, onTabChange }: BookingFiltersProps) {
  return (
    <div className="mb-4 flex flex-col gap-2.5 sm:mb-5 sm:flex-row sm:items-center sm:gap-3">
      <div className="relative sm:max-w-xs sm:flex-1">
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[15px] text-subtle"
        >
          ⌕
        </span>
        <input
          type="search"
          aria-label="Search bookings"
          placeholder="Reference, name, phone, court"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          className={SEARCH_FIELD}
        />
      </div>

      <div
        role="group"
        aria-label="Filter bookings by status"
        className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((entry) => {
          const isCurrent = entry.id === tab

          return (
            <button
              key={entry.id}
              type="button"
              aria-pressed={isCurrent}
              onClick={() => onTabChange(entry.id)}
              className={`${TAB_BUTTON} ${
                isCurrent
                  ? 'border-navy bg-navy text-white'
                  : 'border-line-strong bg-surface text-slate hover:border-line-heavy'
              }`}
            >
              {/* The space is load-bearing: without it the button announces as
                  "Awaiting payment1". */}
              {entry.label}{' '}
              <span
                className={`rounded-full px-1.5 py-px text-[11.5px] font-bold tabular-nums ${
                  isCurrent ? 'bg-white/20 text-white' : 'bg-surface-sunken text-muted'
                }`}
              >
                {entry.count}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface BookingListRowProps {
  readonly row: BookingRow
  readonly onDelete: (payload: unknown) => Promise<Result<unknown>>
  readonly onLoadProof: (payload: unknown) => Promise<Result<readonly PaymentLine[]>>
  readonly onDeleted: () => void
}

function BookingListRow({ row, onDelete, onLoadProof, onDeleted }: BookingListRowProps) {
  return (
    <Row>
      <Cell label="Reference" mobile="title" className="font-bold tabular-nums">
        <Link href={`/admin/bookings/${row.id}`} className="hover:text-olive">
          {row.reference}
        </Link>
      </Cell>
      <Cell label="Customer" mobile="lead">
        <span className="block font-semibold max-sm:text-[14px]">{row.name}</span>
        <span className="mt-px block text-[12.5px] text-subtle">{row.contact}</span>
      </Cell>
      <Cell label="Court" className="text-slate">
        {row.court}
      </Cell>
      <Cell label="When" className="text-slate">
        {row.when}
      </Cell>
      <Cell label="Extras" className="text-slate">
        {row.extras}
      </Cell>
      <Cell label="Status" mobile="badge">
        <StatusBadge status={row.status} />
      </Cell>
      <Cell label="Method" className="text-slate">
        {row.method}
      </Cell>
      <Cell label="Payment" mobile="badge">
        <span className="inline-flex items-center gap-1.5">
          <PaymentBadge status={row.paymentStatus} />
          <ProofButton row={row} onLoadProof={onLoadProof} />
        </span>
      </Cell>
      <Cell label="Total" mobile="trailing" className="text-right font-bold">
        {row.total}
      </Cell>
      {/* The reference is a 60px target in the corner of a card; the whole
          footer of the card is the one staff will actually hit. */}
      <Cell label="" mobile="actions" className="text-right">
        <div className="flex items-center justify-end gap-2 max-sm:flex-col max-sm:items-stretch">
          <Link
            href={`/admin/bookings/${row.id}`}
            aria-label={`Manage ${row.reference}`}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-line-strong bg-surface px-4 text-[13.5px] font-semibold text-ink hover:border-line-heavy max-sm:w-full sm:h-8 sm:px-3 sm:text-[13px]"
          >
            Manage
          </Link>

          <DeleteBookingButton
            bookingId={row.id}
            reference={row.reference}
            onDelete={onDelete}
            onDeleted={onDeleted}
            size="sm"
          />
        </div>
      </Cell>
    </Row>
  )
}

/**
 * A guest attached a proof of payment to this booking, so the row offers it.
 * The desk reconciles transfers from this list and used to have to open each
 * booking to discover whether there was anything to check — and then leave the
 * list to check it. Bookings with nothing uploaded show no control at all.
 */
function ProofButton({
  row,
  onLoadProof,
}: {
  readonly row: BookingRow
  readonly onLoadProof: (payload: unknown) => Promise<Result<readonly PaymentLine[]>>
}) {
  if (!row.hasProof) {
    return null
  }

  return <PaymentProofButton bookingId={row.id} reference={row.reference} onLoad={onLoadProof} />
}
