import { act } from 'react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AdminNav } from './admin-nav'
import { ADMIN_NAV_ITEMS } from './nav-items'

const pathname = vi.hoisted(() => ({ current: '/admin' }))

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
}))

function installScrollMetrics(
  viewport: HTMLElement,
  {
    clientWidth,
    scrollWidth,
    scrollLeft,
  }: Record<'clientWidth' | 'scrollWidth' | 'scrollLeft', number>,
): void {
  Object.defineProperties(viewport, {
    clientWidth: { configurable: true, value: clientWidth },
    scrollWidth: { configurable: true, value: scrollWidth },
    scrollLeft: { configurable: true, writable: true, value: scrollLeft },
  })
}

function installDesktopMatchMedia(initialDesktop = true): {
  readonly desktopQuery: MediaQueryList
  readonly restore: () => void
  readonly setDesktop: (matches: boolean) => void
} {
  const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia')
  const listeners = new Set<EventListenerOrEventListenerObject>()
  let desktopMatches = initialDesktop
  const desktopQuery = {
    get matches() {
      return desktopMatches
    },
    media: '(min-width: 64rem)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'change') listeners.add(listener)
    }),
    removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'change') listeners.delete(listener)
    }),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList
  const reducedMotionQuery = {
    ...desktopQuery,
    matches: false,
    media: '(prefers-reduced-motion: reduce)',
  }

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) =>
      query === '(min-width: 64rem)' ? desktopQuery : reducedMotionQuery,
    ),
  })

  return {
    desktopQuery,
    setDesktop: (matches: boolean) => {
      desktopMatches = matches
      const event = { matches, media: '(min-width: 64rem)' } as MediaQueryListEvent
      for (const listener of [...listeners]) {
        if (typeof listener === 'function') listener(event)
        else listener.handleEvent(event)
      }
    },
    restore: () => {
      if (originalMatchMedia) {
        Object.defineProperty(window, 'matchMedia', originalMatchMedia)
      } else {
        Reflect.deleteProperty(window, 'matchMedia')
      }
    },
  }
}

describe('AdminNav', () => {
  it('marquees the logo alone, and still names the club to a screen reader', () => {
    // Arrange
    pathname.current = '/admin'

    // Act
    render(<AdminNav clubName="Riverbend Pickleball" staffName="Priya Desk" />)

    // Assert — the name is no longer printed beside the mark; an image with
    // empty alt would leave the link unnamed, so it carries the name instead.
    expect(screen.queryByText('Riverbend Pickleball')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Riverbend Pickleball' })).toHaveAttribute(
      'href',
      '/admin',
    )
    expect(screen.getByText('Priya Desk')).toBeInTheDocument()
  })

  it('links to every console section', () => {
    // Arrange
    pathname.current = '/admin'

    // Act
    render(<AdminNav clubName="Riverbend" staffName="Priya" />)

    // Assert — one link per configured section. The list itself is asserted in
    // nav-items.test.ts, so counting a literal here would only duplicate it and
    // break every time a section is added.
    const nav = screen.getByRole('navigation', { name: 'Admin sections' })
    expect(nav.querySelectorAll('a')).toHaveLength(ADMIN_NAV_ITEMS.length)

    for (const item of ADMIN_NAV_ITEMS) {
      expect(screen.getByRole('link', { name: item.label })).toHaveAttribute('href', item.href)
    }
  })

  it('marks the section being viewed as current, for screen readers too', () => {
    // Arrange
    pathname.current = '/admin/bookings/PB-4821'

    // Act
    render(<AdminNav clubName="Riverbend" staffName="Priya" />)

    // Assert — colour alone would not tell a screen reader where it is.
    expect(screen.getByRole('link', { name: 'Bookings' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Schedule' })).not.toHaveAttribute('aria-current')
  })

  it('links staff directly to payment-method management', () => {
    pathname.current = '/admin/payment-methods'

    render(<AdminNav clubName="Riverbend" staffName="Priya" />)

    expect(screen.getByRole('link', { name: 'Payment methods' })).toHaveAttribute(
      'href',
      '/admin/payment-methods',
    )
    expect(screen.getByRole('link', { name: 'Payment methods' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('keeps the compact header focused on identity and the customer site', () => {
    pathname.current = '/admin'

    render(<AdminNav clubName="Riverbend" staffName="Priya Desk" />)

    expect(screen.getByRole('link', { name: 'Customer site' })).toHaveAttribute('href', '/')
    const signedInIdentity = screen.getByText('Signed in as Priya Desk')
    expect(signedInIdentity).toHaveClass('sr-only')
    expect(signedInIdentity).not.toHaveAttribute('aria-hidden')
    expect(screen.getByText('PD')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('Priya Desk')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('button', { name: /Schedule/ })).not.toBeInTheDocument()
  })

  it('includes one responsive Admin badge in the server chrome', () => {
    pathname.current = '/admin'
    const container = document.createElement('div')
    container.innerHTML = renderToString(<AdminNav clubName="Riverbend" staffName="Priya" />)
    const badges = Array.from(container.querySelectorAll('span')).filter(
      (element) => element.textContent === 'Admin',
    )

    expect(badges).toHaveLength(1)
    expect(badges[0]).toHaveClass('hidden', 'lg:inline')
  })

  it('keeps the club home link large enough to tap on mobile', () => {
    pathname.current = '/admin'

    render(<AdminNav clubName="Riverbend" staffName="Priya" />)

    expect(screen.getByRole('link', { name: 'Riverbend' })).toHaveClass('min-h-11', 'lg:min-h-0')
  })

  it('bounds long staff names in the compact identity row', () => {
    const staffName = 'Priya With An Unusually Long Operations Desk Name'
    pathname.current = '/admin'

    render(<AdminNav clubName="Riverbend" staffName={staffName} />)

    expect(screen.getByText(staffName)).toHaveClass('min-w-0', 'max-w-40', 'truncate')
  })

  it('keeps mobile focus order aligned with the visible header', () => {
    pathname.current = '/admin'
    const { container } = render(<AdminNav clubName="Riverbend" staffName="Priya" />)
    const focusable = Array.from(container.querySelectorAll('a, button'))
    const brand = screen.getByRole('link', { name: 'Riverbend' })
    const customerSite = screen.getByRole('link', { name: 'Customer site' })
    const firstSection = screen.getByRole('link', { name: 'Schedule' })

    expect(focusable.indexOf(brand)).toBeLessThan(focusable.indexOf(customerSite))
    expect(focusable.indexOf(customerSite)).toBeLessThan(focusable.indexOf(firstSection))
  })

  it('keeps desktop focus order aligned with the visible header', () => {
    const { desktopQuery, restore } = installDesktopMatchMedia()
    pathname.current = '/admin'

    try {
      const { container, unmount } = render(<AdminNav clubName="Riverbend" staffName="Priya" />)
      const focusable = Array.from(container.querySelectorAll('a, button'))
      const brand = screen.getByRole('link', { name: 'Riverbend' })
      const firstSection = screen.getByRole('link', { name: 'Schedule' })
      const customerSite = screen.getByRole('link', { name: 'Customer site' })

      expect(focusable.indexOf(brand)).toBeLessThan(focusable.indexOf(firstSection))
      expect(focusable.indexOf(firstSection)).toBeLessThan(focusable.indexOf(customerSite))

      unmount()
      expect(desktopQuery.removeEventListener).toHaveBeenCalledWith(
        'change',
        vi.mocked(desktopQuery.addEventListener).mock.calls[0]?.[1],
      )
    } finally {
      restore()
    }
  })

  it('preserves section focus when the navigation switches to desktop', async () => {
    const { restore, setDesktop } = installDesktopMatchMedia(false)
    pathname.current = '/admin/bookings'

    try {
      const { unmount } = render(<AdminNav clubName="Riverbend" staffName="Priya" />)
      const mobileBookings = screen.getByRole('link', { name: 'Bookings' })
      mobileBookings.focus()
      expect(mobileBookings).toHaveFocus()

      await act(async () => setDesktop(true))

      await waitFor(() => {
        const desktopBookings = screen.getByRole('link', { name: 'Bookings' })
        expect(desktopBookings).not.toBe(mobileBookings)
        expect(desktopBookings).toHaveFocus()
      })
      expect(screen.getAllByRole('navigation', { name: 'Admin sections' })).toHaveLength(1)
      unmount()
    } finally {
      restore()
    }
  })

  it('moves arrow focus to the current section when switching to desktop', async () => {
    const { restore, setDesktop } = installDesktopMatchMedia(false)
    pathname.current = '/admin/bookings'

    try {
      const { unmount } = render(<AdminNav clubName="Riverbend" staffName="Priya" />)
      const nav = screen.getByRole('navigation', { name: 'Admin sections' })
      installScrollMetrics(nav, { clientWidth: 300, scrollWidth: 900, scrollLeft: 0 })
      fireEvent.scroll(nav)
      const right = screen.getByRole('button', { name: 'Scroll admin sections right' })
      await waitFor(() => expect(right).toBeEnabled())
      right.focus()

      await act(async () => setDesktop(true))

      await waitFor(() => expect(screen.getByRole('link', { name: 'Bookings' })).toHaveFocus())
      expect(screen.getAllByRole('navigation', { name: 'Admin sections' })).toHaveLength(1)
      unmount()
    } finally {
      restore()
    }
  })

  it('disables both scroll buttons when every admin section fits', async () => {
    pathname.current = '/admin'
    render(<AdminNav clubName="Riverbend" staffName="Priya" />)
    const nav = screen.getByRole('navigation', { name: 'Admin sections' })
    installScrollMetrics(nav, { clientWidth: 600, scrollWidth: 600, scrollLeft: 0 })

    fireEvent.scroll(nav)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Scroll admin sections left' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Scroll admin sections right' })).toBeDisabled()
    })
  })

  it('updates scroll-button availability at the rail boundaries', async () => {
    pathname.current = '/admin'
    render(<AdminNav clubName="Riverbend" staffName="Priya" />)
    const nav = screen.getByRole('navigation', { name: 'Admin sections' })
    const left = screen.getByRole('button', { name: 'Scroll admin sections left' })
    const right = screen.getByRole('button', { name: 'Scroll admin sections right' })
    installScrollMetrics(nav, { clientWidth: 300, scrollWidth: 900, scrollLeft: 0 })

    fireEvent.scroll(nav)

    await waitFor(() => {
      expect(left).toBeDisabled()
      expect(right).toBeEnabled()
    })

    nav.scrollLeft = 600
    fireEvent.scroll(nav)

    await waitFor(() => {
      expect(left).toBeEnabled()
      expect(right).toBeDisabled()
    })
  })

  it('remeasures overflow when the viewport width changes', async () => {
    pathname.current = '/admin'
    render(<AdminNav clubName="Riverbend" staffName="Priya" />)
    const nav = screen.getByRole('navigation', { name: 'Admin sections' })
    installScrollMetrics(nav, { clientWidth: 600, scrollWidth: 600, scrollLeft: 0 })

    fireEvent.resize(window)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Scroll admin sections left' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Scroll admin sections right' })).toBeDisabled()
    })

    installScrollMetrics(nav, { clientWidth: 300, scrollWidth: 900, scrollLeft: 0 })
    fireEvent.resize(window)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Scroll admin sections left' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Scroll admin sections right' })).toBeEnabled()
    })
  })

  it('scrolls the rail in both directions by a useful distance', async () => {
    pathname.current = '/admin'
    const user = userEvent.setup()
    render(<AdminNav clubName="Riverbend" staffName="Priya" />)
    const nav = screen.getByRole('navigation', { name: 'Admin sections' })
    const scrollBy = vi.fn()
    installScrollMetrics(nav, { clientWidth: 300, scrollWidth: 900, scrollLeft: 300 })
    Object.defineProperty(nav, 'scrollBy', { configurable: true, value: scrollBy })

    fireEvent.scroll(nav)
    const left = screen.getByRole('button', { name: 'Scroll admin sections left' })
    const right = screen.getByRole('button', { name: 'Scroll admin sections right' })
    await waitFor(() => {
      expect(left).toBeEnabled()
      expect(right).toBeEnabled()
    })

    await user.click(left)
    expect(scrollBy).toHaveBeenCalledWith({ left: -240, behavior: 'smooth' })

    scrollBy.mockClear()
    await user.click(right)
    expect(scrollBy).toHaveBeenCalledWith({ left: 240, behavior: 'smooth' })
  })

  it('uses instant rail movement when reduced motion is requested', async () => {
    const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia')
    const matchMedia = vi.fn(
      (query: string) =>
        ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as MediaQueryList,
    )
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: matchMedia })
    pathname.current = '/admin'

    try {
      const user = userEvent.setup()
      render(<AdminNav clubName="Riverbend" staffName="Priya" />)
      const nav = screen.getByRole('navigation', { name: 'Admin sections' })
      const scrollBy = vi.fn()
      installScrollMetrics(nav, { clientWidth: 300, scrollWidth: 900, scrollLeft: 300 })
      Object.defineProperty(nav, 'scrollBy', { configurable: true, value: scrollBy })

      fireEvent.scroll(nav)
      const right = screen.getByRole('button', { name: 'Scroll admin sections right' })
      await waitFor(() => expect(right).toBeEnabled())
      await user.click(right)

      expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
      expect(scrollBy).toHaveBeenCalledWith({ left: 240, behavior: 'auto' })
    } finally {
      if (originalMatchMedia) {
        Object.defineProperty(window, 'matchMedia', originalMatchMedia)
      } else {
        Reflect.deleteProperty(window, 'matchMedia')
      }
    }
  })

  it('positions the active tab within the visible rail', () => {
    const originalScrollIntoView = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollIntoView',
    )
    const scrollIntoView = vi.fn(function (
      this: HTMLElement,
      options?: ScrollIntoViewOptions,
    ): void {
      void this
      void options
    })
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })
    pathname.current = '/admin/payment-methods'

    try {
      render(<AdminNav clubName="Riverbend" staffName="Priya" />)
      const activeLink = screen.getByRole('link', { name: 'Payment methods' })

      expect(activeLink).toHaveAttribute('aria-current', 'page')
      expect(scrollIntoView.mock.contexts[0]).toBe(activeLink)
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'center' })
    } finally {
      if (originalScrollIntoView) {
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView)
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
      }
    }
  })

  it('does not reposition the active tab on desktop', () => {
    const { restore } = installDesktopMatchMedia()
    const originalScrollIntoView = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollIntoView',
    )
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })
    pathname.current = '/admin/payment-methods'

    try {
      render(<AdminNav clubName="Riverbend" staffName="Priya" />)

      expect(screen.getByRole('link', { name: 'Payment methods' })).toHaveAttribute(
        'aria-current',
        'page',
      )
      expect(scrollIntoView).not.toHaveBeenCalled()
    } finally {
      if (originalScrollIntoView) {
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView)
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
      }
      restore()
    }
  })

  it('does not reposition the active tab while desktop server markup hydrates', async () => {
    const { restore } = installDesktopMatchMedia()
    const originalScrollIntoView = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollIntoView',
    )
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })
    pathname.current = '/admin/payment-methods'
    const container = document.createElement('div')
    document.body.append(container)
    let root: Root | undefined

    try {
      container.innerHTML = renderToString(<AdminNav clubName="Riverbend" staffName="Priya" />)

      await act(async () => {
        root = hydrateRoot(container, <AdminNav clubName="Riverbend" staffName="Priya" />)
      })

      expect(scrollIntoView).not.toHaveBeenCalled()
      expect(container.querySelectorAll('nav[aria-label="Admin sections"]')).toHaveLength(1)
    } finally {
      if (root) {
        await act(async () => root?.unmount())
      }
      container.remove()
      if (originalScrollIntoView) {
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView)
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
      }
      restore()
    }
  })

  it('renders one responsive list of admin sections', () => {
    pathname.current = '/admin'

    render(<AdminNav clubName="Riverbend" staffName="Priya" />)

    expect(screen.getAllByRole('navigation', { name: 'Admin sections' })).toHaveLength(1)
    expect(screen.getAllByRole('link', { name: 'Bookings' })).toHaveLength(1)
  })

  it('offers a way back to the customer site', () => {
    pathname.current = '/admin'

    render(<AdminNav clubName="Riverbend" staffName="Priya" />)

    expect(screen.getByRole('link', { name: 'Customer site' })).toHaveAttribute('href', '/')
  })
})
