'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ADMIN_ROOT = '/admin'
const STAFF_ROOT = '/staff'

/** The console and staff sign-in bring their own chrome, so the storefront's stands down. */
function isAdminRoute(pathname: string) {
  return [ADMIN_ROOT, STAFF_ROOT].some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  )
}

/**
 * Site chrome for the storefront.
 *
 * A Client Component only because it has to know whether the console is on
 * screen — the console keeps its own header.
 */
export function SiteHeader() {
  const pathname = usePathname()

  // Placed after the hooks so the hook order stays stable across navigation
  // between the storefront and the console.
  if (isAdminRoute(pathname)) {
    return null
  }

  return (
    <header className="sticky top-0 z-40 border-b-2 border-navy-mid bg-navy/95 text-white backdrop-blur">
      <div className="mx-auto flex h-[72px] w-full max-w-[1280px] items-center gap-2 px-4 sm:gap-4 sm:px-7">
        {/* The mark and the wordmark are one link; the mark is decorative so
            the accessible name stays just the club name. */}
        <Link
          href="/"
          className="flex flex-none items-center gap-2 text-white hover:text-white sm:mr-2 sm:gap-2.5"
        >
          <Image
            src="/logo.jpg"
            alt=""
            width={44}
            height={44}
            priority
            className="size-11 flex-none rounded-full bg-white"
          />
          {/* The mark carries the brand on a phone: the wordmark would crowd
              the availability control off a 320px bar. */}
          <span className="hidden font-[family-name:var(--font-display)] text-[18px] font-bold tracking-[-0.02em] sm:inline">
            Hassy Pickleball
          </span>
        </Link>

        {/* The one thing a visitor came to do, reachable from every page: see
            what is open before filling anything in. The short label is for the
            narrowest phones, where the full one would crowd the bar. */}
        <Link
          href="/availability"
          aria-label="See availability"
          className="ml-auto flex-none rounded-[10px] bg-lime px-3 py-2 text-[13px] font-bold text-navy transition hover:bg-white hover:text-navy sm:px-3.5 sm:text-[13.5px]"
        >
          <span className="sm:hidden">Availability</span>
          <span className="hidden sm:inline">See availability</span>
        </Link>
      </div>
    </header>
  )
}
