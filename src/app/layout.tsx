import type { Metadata } from 'next'
import { Bricolage_Grotesque, DM_Sans } from 'next/font/google'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import './globals.css'

const displayFont = Bricolage_Grotesque({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
})

const bodyFont = DM_Sans({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
})

export const metadata: Metadata = {
  title: 'Hassy Pickleball Court',
  description:
    'Rally. Dink. Let’s begin. Book courts, add-ons, and café items at Hassy Pickleball Court.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        {/* `body` is a column flex container, so a page whose content has a
            min-content width wider than the phone stretches sideways rather
            than wrapping. `w-full` pins every page to the viewport and lets the
            scroll strips inside it do the scrolling. */}
        <div className="w-full min-w-0 flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  )
}
