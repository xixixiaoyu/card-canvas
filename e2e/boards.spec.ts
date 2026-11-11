import { expect, test } from '@playwright/test'

test('creates, switches, renames and deletes boards', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  const switcher = page.getByRole('button', { name: '切换白板' })
  await switcher.click()

  const menu = page.getByRole('menu', { name: '白板列表' })
  await expect(menu).toBeVisible()
  await menu.getByLabel('新白板名称').fill('研究板')
  await menu.getByRole('button', { name: '新建' }).click()

  await expect(page.locator('[data-world-item]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '切换白板' })).toContainText(
    '研究板',
  )
  await page.getByRole('button', { name: '切换白板' }).click()
  await page
    .getByRole('menu', { name: '白板列表' })
    .getByRole('button', { name: '我的白板' })
    .click()
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  await page.getByRole('button', { name: '切换白板' }).click()
  const researchRow = page
    .getByRole('menu', { name: '白板列表' })
    .locator('li')
    .filter({ hasText: '研究板' })
  await researchRow.getByRole('button', { name: '重命名白板' }).click()
  const renameInput = page.locator('[data-board-rename-input]')
  await renameInput.fill('深度工作')
  await renameInput.press('Enter')
  const renamedRow = page
    .getByRole('menu', { name: '白板列表' })
    .locator('li')
    .filter({ hasText: '深度工作' })
  await expect(renamedRow).toHaveCount(1)
  await renamedRow.getByRole('button', { name: '删除白板' }).click()
  await renamedRow.getByRole('button', { name: '确认删除白板' }).click()

  await expect(page.getByRole('button', { name: '切换白板' })).toContainText(
    '我的白板',
  )
  await expect(page.locator('[data-world-item]')).toHaveCount(3)
})

test('cards from a deleted board never spill into the remaining board', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  await page.getByRole('button', { name: '切换白板' }).click()
  const menu = page.getByRole('menu', { name: '白板列表' })
  await menu.getByLabel('新白板名称').fill('临时板')
  await menu.getByRole('button', { name: '新建' }).click()
  await expect(page.locator('[data-world-item]')).toHaveCount(0)

  await page.keyboard.press('Control+k')
  await page.getByLabel('卡片标题').fill('只属于临时板')
  await page.keyboard.press('Control+Enter')
  await expect(page.locator('[data-world-item]')).toHaveCount(1)

  await page.getByRole('button', { name: '切换白板' }).click()
  const temporaryRow = page
    .getByRole('menu', { name: '白板列表' })
    .locator('li')
    .filter({ hasText: '临时板' })
  await temporaryRow.getByRole('button', { name: '删除白板' }).click()
  await temporaryRow.getByRole('button', { name: '确认删除白板' }).click()

  await expect(page.getByRole('button', { name: '切换白板' })).toContainText(
    '我的白板',
  )
  await expect(page.locator('[data-world-item]')).toHaveCount(3)
  await expect(
    page.locator('[data-world-item]').filter({ hasText: '只属于临时板' }),
  ).toHaveCount(0)
})

test('clears the current board without deleting it and can undo once', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  await page.getByRole('button', { name: '切换白板' }).click()
  await page.getByRole('button', { name: '清空当前白板' }).click()
  await page.getByRole('button', { name: '确认清空当前白板' }).click()

  await expect(page.locator('[data-world-item]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '切换白板' })).toContainText(
    '我的白板',
  )
  await expect(page.locator('[data-empty-state]')).toBeVisible()

  await page
    .getByRole('status')
    .filter({ hasText: '已清空' })
    .getByRole('button', { name: '撤销' })
    .click()
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  await page.keyboard.press('Control+Shift+z')
  await expect(page.locator('[data-world-item]')).toHaveCount(0)
})
