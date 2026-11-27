import type { ReactNode } from 'react'
import type { StatCard } from '../view/schedule-stats'

/**
 * The pieces every admin screen repeats: page heading, stat row, card shell,
 * and the empty state. Kept here so the seven screens cannot drift apart.
 */

export const CARD = 'rounded-[14px] border border-line bg-surface'

/**
 * The shell a table sits in. On a phone the rows are cards in their own right,
 * and a card inside a card is two borders and no hierarchy — so the frame is
 * dropped there and the list floats on the canvas.
 */
export const TABLE_SHELL = `${CARD} max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent`

/** Table internals: the screens compose DataTable/Row/Cell, never these. */
const TABLE_HEAD = 'bg-surface-alt text-[11.5px] font-bold tracking-[0.08em] text-subtle uppercase'
const CELL_SPACING = 'px-4 py-3.5 align-middle max-sm:px-0'
const CELL = `${CELL_SPACING} text-left`

/**
 * Where a column's heading sits. Every heading used to be forced left, which
 * put "Total" on the far left of a column whose figures are right-aligned and
 * made the table look broken. Headings now follow their column.
 */
export type ColumnAlign = 'left' | 'center' | 'right'

export interface TableColumnSpec {
  readonly label: string
  readonly align?: ColumnAlign
}

/** A column is its heading, or its heading plus how that heading sits. */
export type TableColumn = string | TableColumnSpec

const ALIGN: Record<ColumnAlign, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
}

function columnLabel(column: TableColumn): string {
  return typeof column === 'string' ? column : column.label
}

/**
 * The console's tables, which become a stack of cards below `sm`.
 *
 * One DOM serves both: a phone-only card list beside a desktop table would
 * double every value in the accessibility tree and drift the first time a
 * column changed. Below `sm` the table's `display` is overridden, which is what
 * drops a table's implicit roles in most browsers — so table, row, columnheader
 * and cell are spelled out. The header row goes `sr-only` rather than `hidden`,
 * and each cell that stays a label-and-value pair prints its own column name
 * from `data-label`, because a bare value in a card is unattributable.
 */

const STACKED_ROW =
  'max-sm:flex max-sm:flex-wrap max-sm:items-center max-sm:gap-x-3 max-sm:gap-y-2 ' +
  'max-sm:rounded-2xl max-sm:border max-sm:border-line max-sm:bg-surface max-sm:p-4 ' +
  'max-sm:shadow-[0_1px_2px_rgba(11,37,69,0.06)]'

/**
 * What part a cell plays in the phone card. The stacked layout used to print
 * every column as one more line of small grey text, so a nine-column booking
 * read as nine identical rows and nothing led the card. These say which value
 * is the heading, which is the figure beside it, and which are the details
 * underneath.
 */
export type CellMobileRole = 'inline' | 'title' | 'trailing' | 'lead' | 'badge' | 'actions'

/** The column name, printed by the cell itself because the header is off-screen. */
const MOBILE_LABEL =
  'max-sm:before:flex-none max-sm:before:content-[attr(data-label)] ' +
  'max-sm:before:text-[11px] max-sm:before:font-bold max-sm:before:tracking-[0.08em] ' +
  'max-sm:before:text-subtle max-sm:before:uppercase'

/**
 * Order rather than source order: the card reads title, figure, subtitle,
 * badges, details, actions, whatever sequence the desktop columns happen to sit
 * in. Keeping one DOM is what stops the two layouts drifting.
 */
const MOBILE_ROLES: Record<CellMobileRole, string> = {
  inline:
    'max-sm:order-5 max-sm:flex max-sm:basis-full max-sm:items-baseline max-sm:justify-between ' +
    `max-sm:gap-4 max-sm:py-0.5 max-sm:text-[13.5px] ${MOBILE_LABEL}`,
  title: 'max-sm:order-1 max-sm:min-w-0 max-sm:flex-1 max-sm:py-0 max-sm:text-[16px]',
  trailing: 'max-sm:order-2 max-sm:py-0 max-sm:text-right max-sm:text-[16px] max-sm:font-bold',
  lead: 'max-sm:order-3 max-sm:basis-full max-sm:py-0',
  badge: 'max-sm:order-4 max-sm:w-auto max-sm:py-0',
  actions:
    'max-sm:order-6 max-sm:mt-0.5 max-sm:basis-full max-sm:border-t max-sm:border-line max-sm:pt-3',
}

export interface DataTableProps {
  readonly label: string
  readonly columns: readonly TableColumn[]
  /**
   * Minimum width for the table layout, which may only apply from `sm` up —
   * an unconditional one is what makes a phone scroll sideways.
   */
  readonly wideClassName?: string
  readonly children: ReactNode
}

export function DataTable({ label, columns, wideClassName = '', children }: DataTableProps) {
  return (
    <table
      role="table"
      aria-label={label}
      className={`w-full border-collapse text-[14px] max-sm:block ${wideClassName}`}
    >
      <thead className={`${TABLE_HEAD} max-sm:sr-only`}>
        <tr role="row">
          {columns.map((column, index) => (
            <th
              key={columnLabel(column) || index}
              role="columnheader"
              scope="col"
              className={`${CELL_SPACING} ${ALIGN[typeof column === 'string' ? 'left' : (column.align ?? 'left')]}`}
            >
              {columnLabel(column)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="max-sm:flex max-sm:flex-col max-sm:gap-3">{children}</tbody>
    </table>
  )
}

export interface RowProps {
  readonly className?: string
  readonly children: ReactNode
}

export function Row({ className = '', children }: RowProps) {
  return (
    <tr role="row" className={`border-t border-[#f2f5f8] ${STACKED_ROW} ${className}`}>
      {children}
    </tr>
  )
}

export interface CellProps {
  /** The column this cell sits under; printed beside the value on a phone. */
  readonly label: string
  /** What part the cell plays in the phone card. Defaults to a labelled pair. */
  readonly mobile?: CellMobileRole
  readonly className?: string
  readonly children: ReactNode
}

export function Cell({ label, mobile = 'inline', className = '', children }: CellProps) {
  return (
    <td
      role="cell"
      data-label={label}
      data-mobile={mobile}
      className={`${CELL} ${MOBILE_ROLES[mobile]} ${className}`}
    >
      {children}
    </td>
  )
}

/**
 * A row that spans the table to hold an inline editor. It carries a form rather
 * than column values, so it takes no `data-label`.
 */
export function FullWidthRow({
  columnCount,
  className = '',
  children,
}: {
  readonly columnCount: number
  readonly className?: string
  readonly children: ReactNode
}) {
  return (
    <tr role="row" className={`border-t border-[#f2f5f8] max-sm:block ${className}`}>
      <td role="cell" colSpan={columnCount} className="bg-surface-alt p-0 max-sm:block">
        {children}
      </td>
    </tr>
  )
}

export interface AdminPageHeaderProps {
  readonly title: string
  readonly subtitle: string
  readonly children?: ReactNode
}

export function AdminPageHeader({ title, subtitle, children }: AdminPageHeaderProps) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3 sm:mb-5 sm:gap-4">
      <div className="min-w-0">
        <h1 className="mb-1 font-[family-name:var(--font-display)] text-[23px] font-bold tracking-[-0.03em] sm:text-[28px]">
          {title}
        </h1>
        <p className="m-0 text-[13.5px] text-muted sm:text-[14px]">{subtitle}</p>
      </div>
      {children ? (
        /* A 90px button in the corner of a 375px screen is a miss waiting to
           happen, so the actions take the width they have. */
        <div className="flex flex-wrap gap-2.5 max-sm:w-full max-sm:[&>*]:flex-1">{children}</div>
      ) : null}
    </div>
  )
}

export interface StatCardsProps {
  readonly stats: readonly StatCard[]
}

export function StatCards({ stats }: StatCardsProps) {
  return (
    /* Two to a row on a phone: four stacked cards push the day's work below
       the fold before the desk has read anything. */
    <div className="mb-4 grid grid-cols-2 gap-2.5 sm:mb-[18px] sm:gap-3 xl:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className={`${CARD} px-3.5 py-3 sm:px-[18px] sm:py-4`}>
          <p className="m-0 text-[10.5px] font-bold tracking-[0.09em] text-subtle uppercase sm:text-[12px]">
            {stat.label}
          </p>
          <p className="my-1 font-[family-name:var(--font-display)] text-[21px] font-bold sm:my-1.5 sm:text-[27px]">
            {stat.value}
          </p>
          <p className="m-0 text-[11.5px] font-semibold text-olive sm:text-[12.5px]">
            {stat.detail}
          </p>
        </div>
      ))}
    </div>
  )
}

export interface EmptyStateProps {
  readonly children: ReactNode
}

export function EmptyState({ children }: EmptyStateProps) {
  return <p className="m-0 px-4 py-10 text-center text-[14px] text-muted">{children}</p>
}

/** Screen shell: the max width and padding shared by every admin page. */
export function AdminScreen({ children }: { readonly children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[1440px] px-4 pt-5 pb-14 sm:px-7 sm:pt-6 sm:pb-16">
      {children}
    </div>
  )
}
