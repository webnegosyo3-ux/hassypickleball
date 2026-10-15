'use client'

import Image from 'next/image'
import { usePathname } from 'next/navigation'

/** The admin console has its own chrome, so the storefront footer stands down. */
export function SiteFooter() {
  const pathname = usePathname()

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return null
  }

  return (
    <footer className="mt-auto bg-navy text-white">
      <div
        aria-hidden
        className="h-1 bg-[linear-gradient(90deg,#1746c9_0%,#1746c9_70%,#d9e43a_70%,#d9e43a_100%)]"
      />
      <div className="mx-auto flex w-full max-w-[1280px] flex-col items-center gap-5 px-4 py-9 text-center sm:flex-row sm:justify-between sm:px-7 sm:text-left">
        <div className="flex items-center gap-3.5">
          <Image
            src="/logo.jpg"
            alt=""
            width={52}
            height={52}
            className="size-[52px] flex-none rounded-full bg-white"
          />
          <div>
            <p className="font-[family-name:var(--font-display)] text-[17px] font-bold tracking-[-0.02em]">
              Hassy Pickleball Court
            </p>
            <p className="text-[13px] text-lime">Rally. Dink. Let’s begin.</p>
          </div>
        </div>
      </div>
    </footer>
  )
}
