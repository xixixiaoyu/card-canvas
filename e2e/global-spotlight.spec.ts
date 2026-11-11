import { expect, test, type Page } from '@playwright/test'

const searchDialog = (page: Page) =>
  page.getByRole('dialog', { name: 'Card Atlas 卡片纵览' })
const searchInput = (page: Page) =>
  page.getByRole('textbox', { name: '搜索卡片' })

async function createBoard(page: Page, name: string) {
  await page.getByRole('button', { name: '切换白板' }).click()
  const menu = page.getByRole('menu', { name: '白板列表' })
  await menu.getByLabel('新白板名称').fill(name)
  await menu.getByRole('button', { name: '新建' }).click()
  await expect(page.locator('[data-world-item]')).toHaveCount(0)
  await page.waitForTimeout(350)
}

async function switchBoard(page: Page, name: string) {
  await page.getByRole('button', { name: '切换白板' }).click()
  await page
    .getByRole('menu', { name: '白板列表' })
    .getByRole('button', { name })
    .click()
  await page.waitForTimeout(800)
}

test('global spotlight crosses boards and hydrates before flight', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)
  await createBoard(page, '跨板目标板')

  await page.keyboard.press('Control+k')
  await page.getByLabel('卡片标题').fill('跨板目标卡片')
  await page.getByLabel('卡片正文').fill('我在另一块白板上等你。')
  await page.keyboard.press('Control+Enter')
  await expect(page.locator('[data-world-item]')).toHaveCount(1)
  await page.waitForTimeout(700)

  await switchBoard(page, '我的白板')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  await page.keyboard.press('Control+f')
  const dialog = searchDialog(page)
  await expect(dialog).toBeVisible()
  await searchInput(page).fill('跨板目标')
  const target = page.locator('[data-spotlight-result]').first()
  await expect(target).toContainText('跨板目标板')
  await expect(target.locator('[data-board-badge]')).toHaveText('跨板目标板')

  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('button', { name: '切换白板' })).toContainText(
    '跨板目标板',
  )

  const card = page.locator('[data-world-item].is-selected')
  await expect(card).toContainText('跨板目标卡片')
  await expect(page.locator('[data-card-pulse]')).toHaveCount(1)

  const box = await card.boundingBox()
  const viewport = page.viewportSize()
  expect(box).not.toBeNull()
  expect(viewport).not.toBeNull()
  expect(Math.abs(box!.x + box!.width / 2 - viewport!.width / 2)).toBeLessThan(
    2,
  )
  expect(
    Math.abs(box!.y + box!.height / 2 - viewport!.height / 2),
  ).toBeLessThan(2)
})

test('Card Atlas browses the workspace and filters to the current board', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)
  await createBoard(page, 'Atlas 目标板')

  await page.keyboard.press('Control+k')
  await page.getByLabel('卡片标题').fill('Atlas 纵览卡片')
  await page.getByLabel('卡片正文').fill('这里有一条需要纵览的卡片。')
  await page.keyboard.press('Control+Enter')
  await expect(page.locator('[data-world-item]')).toHaveCount(1)
  await page.waitForTimeout(700)

  await switchBoard(page, '我的白板')
  await page.keyboard.press('Control+f')
  const dialog = searchDialog(page)
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('4 CARDS')
  await expect(page.locator('[data-spotlight-result]')).toHaveCount(4)
  await expect(page.locator('[data-atlas-scope="workspace"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await page.locator('[data-atlas-scope="board"]').click()
  await expect(dialog).toContainText('3 CARDS')
  await expect(page.locator('[data-spotlight-result]')).toHaveCount(3)
  await expect(
    page.locator('[data-spotlight-result] [data-board-badge]'),
  ).toHaveText(['我的白板', '我的白板', '我的白板'])
})

test('hierarchical tags roll up children but isolate siblings', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  await page.keyboard.press('Control+k')
  await page.getByLabel('卡片标题').fill('心理学总览')
  await page.getByLabel('添加标签').fill('心理学')
  await page.getByLabel('添加标签').press('Enter')
  await page.keyboard.press('Control+Enter')
  await expect(page.locator('[data-world-item]')).toHaveCount(4)
  const overviewCard = page
    .locator('[data-world-item]')
    .filter({ hasText: '心理学总览' })
  await expect(overviewCard).not.toHaveClass(/is-landing/)

  const parentTag = page.locator('[data-filter-tag="心理学"]').first()
  await parentTag.click()
  await expect(parentTag).toHaveAttribute('aria-pressed', 'true')

  const dimmed = page.locator('[data-world-item].is-dimmed')
  await expect(dimmed).toHaveCount(1)
  await expect(dimmed).toContainText('先让气息落下')
  await expect(
    page.locator('[data-world-item]').filter({ hasText: '心理学总览' }),
  ).not.toHaveClass(/is-dimmed/)
  await expect(
    page.locator('[data-world-item]').filter({ hasText: '声音的支点' }),
  ).not.toHaveClass(/is-dimmed/)
  await expect(
    page.locator('[data-world-item]').filter({ hasText: '边界不是墙' }),
  ).not.toHaveClass(/is-dimmed/)

  const childTag = page.locator('[data-filter-tag="心理学/防御机制"]').first()
  await childTag.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-world-item].is-dimmed')).toHaveCount(3)
  await expect(
    page.locator('[data-world-item]').filter({ hasText: '边界不是墙' }),
  ).toHaveClass(/is-dimmed/)

  await page.mouse.click(350, 680)
  await expect(page.locator('[data-world-item].is-dimmed')).toHaveCount(0)
  await expect(
    page.locator('[data-filter-tag][aria-pressed="true"]'),
  ).toHaveCount(0)
})

test('the HUD exposes search on a touch-sized viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  const searchButton = page.getByRole('button', { name: '卡片纵览' })
  await expect(searchButton).toBeVisible()
  await searchButton.click()

  const dialog = searchDialog(page)
  await expect(dialog).toBeVisible()
  const input = searchInput(page)
  await expect(input).toBeFocused()
  await input.fill('边界')
  await expect(page.locator('[data-spotlight-result]').first()).toContainText(
    '边界不是墙',
  )
  await expect(
    page
      .locator('[data-spotlight-result]')
      .first()
      .locator('[data-board-badge]'),
  ).toHaveText('我的白板')

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
