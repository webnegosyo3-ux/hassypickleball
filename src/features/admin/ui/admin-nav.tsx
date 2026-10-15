'use client'

import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ADMIN_NAV_ITEMS, isNavItemActive } from './nav-items'
import {
  DESKTOP_MEDIA_QUERY,
  getDesktopServerSnapshot,
  getDesktopSnapshot,
  matchesMediaQuery,
  prefersReducedMotion,
  subscribeToDesktopViewport,
} from './desktop-viewport'

const SCROLL_EDGE_TOLERANCE = 1
const SCROLL_PAGE_RATIO = 0.8
const CURRENT_SECTION_FOCUS = 'current-section'

const MOBILE_NAV_LINK =
  'flex h-11 flex-none snap-center items-center border-b-2 px-3.5 text-[14px] font-semibold whitespace-nowrap ' +
  'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-navy ' +
  'lg:h-auto lg:w-full lg:rounded-lg lg:border-b-0 lg:px-3.5 lg:py-2.5 lg:text-[14.5px] lg:focus-visible:outline-white'

/**
 * Desktop width, plus the focus the nav has to carry across the switch: the
 * two layouts are different DOM, so the link that had focus is gone by the
 * time the new one renders unless it is remembered first.
 */
function useIsDesktopNav(headerRef: RefObject<HTMLElement | null>): boolean {
  const focusToRestoreRef = useRef<string | null>(null)
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      subscribeToDesktopViewport(onStoreChange, () => {
        const header = headerRef.current
        const focused = document.activeElement
        if (!(focused instanceof HTMLElement) || !header?.contains(focused)) {
          focusToRestoreRef.current = null
          return
        }

        focusToRestoreRef.current =
          focused.dataset.adminNavFocus ??
          (focused.dataset.adminNavScroll === undefined ? null : CURRENT_SECTION_FOCUS)
      }),
    [headerRef],
  )
  const isDesktop = useSyncExternalStore(subscribe, getDesktopSnapshot, getDesktopServerSnapshot)

  useEffect(() => {
    const focusIdentity = focusToRestoreRef.current
    if (!focusIdentity) return

    focusToRestoreRef.current = null
    const header = headerRef.current
    const target =
      focusIdentity === CURRENT_SECTION_FOCUS
        ? header?.querySelector<HTMLElement>('[aria-current="page"]')
        : Array.from(header?.querySelectorAll<HTMLElement>('[data-admin-nav-focus]') ?? []).find(
            (element) => element.dataset.adminNavFocus === focusIdentity,
          )
    target?.focus({ preventScroll: true })
  }, [headerRef, isDesktop])

  return isDesktop
}

interface MobileAdminNavRailProps {
  readonly isDesktop: boolean
  readonly pathname: string
}

function MobileAdminNavRail({ isDesktop, pathname }: MobileAdminNavRailProps) {
  const viewportRef = useRef<HTMLElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateBoundaries = useCallback((): void => {
    const viewport = viewportRef.current
    if (!viewport) return

    const maximum = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
    setCanScrollLeft(viewport.scrollLeft > SCROLL_EDGE_TOLERANCE)
    setCanScrollRight(viewport.scrollLeft < maximum - SCROLL_EDGE_TOLERANCE)
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    if (!matchesMediaQuery(DESKTOP_MEDIA_QUERY)) {
      const activeLink = viewport.querySelector<HTMLElement>('[aria-current="page"]')
      activeLink?.scrollIntoView?.({ block: 'nearest', inline: 'center' })
    }
    updateBoundaries()

    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(updateBoundaries)
    resizeObserver?.observe(viewport)
    window.addEventListener('resize', updateBoundaries)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', updateBoundaries)
    }
  }, [isDesktop, pathname, updateBoundaries])

  function scroll(direction: -1 | 1): void {
    const viewport = viewportRef.current
    if (!viewport) return

    viewport.scrollBy({
      left: direction * viewport.clientWidth * SCROLL_PAGE_RATIO,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
  }

  return (
    <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] bg-white text-navy lg:contents">
      {!isDesktop && (
        <button
          type="button"
          data-admin-nav-scroll
          aria-label="Scroll admin sections left"
          disabled={!canScrollLeft}
          onClick={() => scroll(-1)}
          className="grid size-11 place-items-center border-r border-navy/10 text-xl disabled:text-navy/25 lg:hidden"
        >
          <span aria-hidden>‹</span>
        </button>
      )}

      <nav
        ref={viewportRef}
        aria-label="Admin sections"
        onScroll={updateBoundaries}
        className="flex min-w-0 snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:order-3 lg:flex-1 lg:snap-none lg:flex-col lg:gap-1 lg:overflow-x-visible lg:overflow-y-auto"
      >
        {ADMIN_NAV_ITEMS.map((item) => {
          const isCurrent = isNavItemActive(pathname, item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              data-admin-nav-focus={`section:${item.href}`}
              aria-current={isCurrent ? 'page' : undefined}
              className={`${MOBILE_NAV_LINK} ${
                isCurrent
                  ? 'border-navy text-navy lg:bg-white/15 lg:text-white'
                  : 'border-transparent text-navy/60 hover:text-navy lg:text-white/65 lg:hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      {!isDesktop && (
        <button
          type="button"
          data-admin-nav-scroll
          aria-label="Scroll admin sections right"
          disabled={!canScrollRight}
          onClick={() => scroll(1)}
          className="grid size-11 place-items-center border-l border-navy/10 text-xl disabled:text-navy/25 lg:hidden"
        >
          <span aria-hidden>›</span>
        </button>
      )}
    </div>
  )
}

export interface AdminNavProps {
  readonly clubName: string
  readonly staffName: string
}

function initialsOf(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

function ClubHomeLink({ clubName }: Pick<AdminNavProps, 'clubName'>) {
  return (
    <Link
      href="/admin"
      data-admin-nav-focus="brand"
      className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 text-white hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white lg:order-1 lg:mb-1 lg:min-h-0 lg:flex-none"
    >
      <Image
        src="/logo.jpg"
        alt=""
        width={36}
        height={36}
        className="size-9 flex-none rounded-full bg-white"
      />
      <span className="truncate font-[family-name:var(--font-display)] text-[17px] font-bold tracking-[-0.02em] lg:text-[18px]">
        {clubName}
      </span>
    </Link>
  )
}

function AdminBadge() {
  return (
    <span className="hidden flex-none rounded-md bg-white/12 px-2.5 py-[5px] text-[11px] font-bold tracking-[0.1em] text-lime uppercase lg:order-2 lg:inline">
      Admin
    </span>
  )
}

function AccountBlock({ staffName }: Pick<AdminNavProps, 'staffName'>) {
  return (
    <div className="ml-auto flex min-w-0 flex-none items-center gap-1 sm:gap-3 lg:order-4 lg:ml-0 lg:flex-col lg:items-start lg:gap-1 lg:border-t lg:border-white/10 lg:pt-4">
      <Link
        href="/"
        data-admin-nav-focus="customer-site"
        aria-label="Customer site"
        className="flex min-h-11 flex-none items-center px-1 text-[13px] font-semibold text-white/70 hover:text-lime focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:px-2 lg:min-h-0 lg:px-0"
      >
        <span className="sm:hidden">Site</span>
        <span className="hidden sm:inline">Customer site</span>
      </Link>

      <span className="flex min-h-11 min-w-0 items-center gap-2 lg:min-h-0">
        <span className="sr-only">Signed in as {staffName}</span>
        <span
          aria-hidden
          className="grid size-8 flex-none place-items-center rounded-full bg-navy-mid text-[12px] font-bold text-lime lg:size-7"
        >
          {initialsOf(staffName)}
        </span>
        <span
          aria-hidden
          className="hidden max-w-40 min-w-0 truncate text-[13px] text-white/80 sm:inline lg:max-w-32 xl:max-w-48"
        >
          {staffName}
        </span>
      </span>
    </div>
  )
}

export function AdminNav({ clubName, staffName }: AdminNavProps) {
  const pathname = usePathname()
  const headerRef = useRef<HTMLElement>(null)
  const isDesktop = useIsDesktopNav(headerRef)

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-40 bg-navy text-white lg:fixed lg:inset-y-0 lg:left-0 lg:w-60 lg:overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-[1440px] lg:flex lg:h-full lg:max-w-none lg:flex-col lg:items-stretch lg:gap-3 lg:px-4 lg:py-5">
        {isDesktop ? (
          <>
            <ClubHomeLink clubName={clubName} />
            <AdminBadge />
            <MobileAdminNavRail isDesktop pathname={pathname} />
            <AccountBlock staffName={staffName} />
          </>
        ) : (
          <>
            <div className="flex h-14 items-center gap-2 px-4 sm:gap-3 sm:px-7 lg:contents">
              <ClubHomeLink clubName={clubName} />
              <AdminBadge />
              <AccountBlock staffName={staffName} />
            </div>
            <MobileAdminNavRail isDesktop={false} pathname={pathname} />
          </>
        )}
      </div>
    </header>
  )
}
