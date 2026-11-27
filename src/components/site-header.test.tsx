import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SiteHeader } from './site-header'

const pathname = vi.hoisted(() => ({ current: '/' }))

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
}))

function renderHeader() {
  return render(<SiteHeader />)
}

beforeEach(() => {
  // Every storefront expectation below assumes a customer-facing route; the
  // admin cases opt in by setting this themselves.
  pathname.current = '/'
})

describe('SiteHeader', () => {
  it('exposes the header as a banner landmark', () => {
    renderHeader()

    expect(screen.getByRole('banner')).toBeInTheDocument()
  })

  it('points the brand mark at the storefront root', () => {
    renderHeader()

    expect(screen.getByRole('link', { name: /pickleball/i })).toHaveAttribute('href', '/')
  })

  it('offers the one action a visitor came for, from the bar itself', () => {
    renderHeader()

    expect(screen.getByRole('link', { name: 'See availability' })).toHaveAttribute(
      'href',
      '/availability',
    )
  })

  it('keeps no cart control in the bar, because booking happens in one form', () => {
    renderHeader()

    // The cart and its drawer are gone: the court page collects the details,
    // the date and the payment together, so a badge counting selections would
    // count something that no longer exists.
    expect(screen.queryByRole('button', { name: /^booking/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  describe('on the admin console', () => {
    it('renders no storefront chrome on the console root', () => {
      // Arrange
      pathname.current = '/admin'

      // Act
      renderHeader()

      // Assert
      expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    })

    it('renders no storefront chrome on a nested console section', () => {
      // Arrange
      pathname.current = '/admin/courts'

      // Act
      renderHeader()

      // Assert
      expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    })

    it('hides the availability control along with the rest of the header', () => {
      // Arrange
      pathname.current = '/admin/products'

      // Act
      renderHeader()

      // Assert
      expect(screen.queryByRole('link', { name: 'See availability' })).not.toBeInTheDocument()
    })

    it('keeps the header on a storefront route that merely starts with the same letters', () => {
      // Arrange
      pathname.current = '/administration-guide'

      // Act
      renderHeader()

      // Assert
      expect(screen.getByRole('banner')).toBeInTheDocument()
    })
  })
})
