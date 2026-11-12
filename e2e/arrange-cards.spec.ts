import { expect, test, type Page } from '@playwright/test'

function readWorldPositions(page: Page) {
  return page.locator('[data-world-item]').evaluateAll((elements) =>
    elements
      .map((element) => ({
        id: element.getAttribute('data-item-id') ?? '',
        x: Number.parseFloat((element as HTMLElement).style.left),
        y: Number.parseFloat((element as HTMLElement).style.top),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  )
}

test('one-click arrange tidies card positions as one undoable action', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)
  const before = await readWorldPositions(page)

  await page.getByRole('button', { name: '一键整理当前白板' }).click()
  const menu = page.locator('[data-arrange-menu]')
  await expect(menu).toBeVisible()
  await menu.locator('[data-arrange-mode="reading"]').click()
  const undo = page.locator('header button[aria-label="撤销"]')
  await expect(undo).toHaveAttribute('title', /整理当前白板/)
  await expect(page.locator('[data-world-item].is-selected')).toHaveCount(0)

  const after = await readWorldPositions(page)
  expect(after).not.toEqual(before)

  await undo.click()
  await expect.poll(() => readWorldPositions(page)).toEqual(before)
})

test('arranges only selected cards into a side region', async ({ page }) => {
  await page.goto('/')
  const cards = page.locator('[data-world-item]')
  await cards.nth(0).locator('h2').click()
  await cards
    .nth(1)
    .locator('h2')
    .click({ modifiers: ['Shift'] })

  await page.getByRole('button', { name: '一键整理当前白板' }).click()
  await page.locator('[data-arrange-mode="selected"]').click()
  await expect(
    page.locator('header button[aria-label="撤销"]'),
  ).toHaveAttribute('title', /整理选中卡片/)
  await expect(page.locator('[data-world-item].is-selected')).toHaveCount(0)
})

test('arranges cards by their connection clusters', async ({ page }) => {
  await page.goto('/')
  const cards = page.locator('[data-world-item]')
  await cards.nth(0).locator('h2').click()
  const handle = await cards.nth(0).locator('.link-handle').boundingBox()
  const target = await cards.nth(1).boundingBox()
  if (!handle || !target) throw new Error('missing connection geometry')

  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  )
  await page.mouse.down()
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
    { steps: 10 },
  )
  await page.mouse.up()
  await expect(page.locator('[data-line]')).toHaveCount(1)

  await page.getByRole('button', { name: '一键整理当前白板' }).click()
  const clusterMode = page.locator('[data-arrange-mode="clusters"]')
  await expect(clusterMode).toBeEnabled()
  await clusterMode.click()
  await expect(
    page.locator('header button[aria-label="撤销"]'),
  ).toHaveAttribute('title', /按关联整理/)
})
