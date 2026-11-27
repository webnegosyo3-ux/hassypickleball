import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

/**
 * Every route segment that awaits a database read needs a `loading.tsx`, or
 * Next.js has no Suspense boundary to stream into and the browser sits on the
 * previous page until the slowest query returns. These tests assert the
 * boundary exists per segment and that the wait is announced, not just drawn.
 */

const SEGMENTS = [
  {
    name: 'storefront catalog',
    load: () => import('./loading'),
    label: /courts/i,
  },
  {
    name: 'court detail',
    load: () => import('./courts/[slug]/loading'),
    label: /court/i,
  },
  {
    name: 'availability',
    load: () => import('./availability/loading'),
    label: /availability/i,
  },
  {
    name: 'admin console',
    load: () => import('./admin/loading'),
    label: /loading/i,
  },
] as const

describe.each(SEGMENTS)('$name loading state', ({ load, label }) => {
  it('announces the wait to assistive tech', async () => {
    const { default: Loading } = await load()

    render(<Loading />)

    expect(screen.getByRole('status', { name: label })).toBeInTheDocument()
  })

  it('marks itself busy so the placeholders are not mistaken for real content', async () => {
    const { default: Loading } = await load()

    render(<Loading />)

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
  })
})
