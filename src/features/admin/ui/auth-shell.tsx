import Image from 'next/image'
import type { ReactNode } from 'react'

/**
 * The full-page frame for staff sign-in and the no-access notice.
 *
 * Built from the storefront hero's palette so the console's front door looks
 * like the website: navy court glow behind a white card, the club mark above
 * it. One column on a phone, with the card pinned to the thumb-reachable lower
 * half; the card simply centres on wider screens.
 */
export function AuthShell({ children }: { readonly children: ReactNode }) {
  return (
    <main className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-navy px-4 py-10 text-white">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(60%_70%_at_85%_20%,#1746c9_0%,transparent_70%),radial-gradient(40%_40%_at_8%_100%,rgba(217,228,58,0.16)_0%,transparent_70%),linear-gradient(135deg,#0a1230_0%,#0f2766_100%)]"
      />

      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <Image
          src="/logo.jpg"
          alt=""
          width={72}
          height={72}
          priority
          className="size-[72px] rounded-full bg-white"
        />
        <div>
          <p className="m-0 font-[family-name:var(--font-display)] text-[20px] font-bold tracking-[-0.02em]">
            HASSY PICKLEBALL COURT
          </p>
          <p className="m-0 mt-1 text-[11px] font-bold tracking-[0.14em] text-lime uppercase">
            Admin console
          </p>
        </div>
      </div>

      <div className="w-full max-w-[420px] rounded-2xl bg-surface p-6 text-ink shadow-[0_20px_60px_rgba(0,0,0,0.35)] sm:p-8">
        {children}
      </div>
    </main>
  )
}
