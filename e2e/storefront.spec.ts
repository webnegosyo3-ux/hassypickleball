import { expect, test } from '@playwright/test'

/**
 * The storefront's primary actions sit on navy. Tailwind's `text-white` has to
 * actually win over the global `a { color: ... }` base rule, or every call to
 * action renders navy-on-navy and disappears. Unit tests cannot see this —
 * it is a cascade question, so it is asserted against real computed styles.
 */

const WHITE = 'rgb(255, 255, 255)'

test.describe('storefront chrome', () => {
  test('the "View & book" call to action is legible on its navy button', async ({ page }) => {
    await page.goto('/')

    const cta = page.getByRole('link', { name: /view & book/i }).first()

    await expect(cta).toBeVisible()
    await expect(cta).toHaveCSS('color', WHITE)
  })

  test('the active filter chip is legible on navy', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('link', { name: 'All courts' })).toHaveCSS('color', WHITE)
  })

  test('the brand wordmark is legible on the navy header', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('banner').getByRole('link', { name: /pickleball/i })).toHaveCSS(
      'color',
      WHITE,
    )
  })

  test('offers one obvious way to start booking from the header', async ({ page }) => {
    await page.goto('/')

    // Scoped to the bar: the hero repeats the same call to action below it.
    await expect(
      page.getByRole('banner').getByRole('link', { name: 'See availability' }),
    ).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Catalog layout' })).toHaveCount(0)
  })
})
