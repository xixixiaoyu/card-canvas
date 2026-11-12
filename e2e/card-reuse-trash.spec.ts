import { expect, test, type Page } from '@playwright/test'

async function switchBoard(page: Page, name: string) {
  await page.getByRole('button', { name: '切换白板' }).click()
  await page
    .getByRole('menu', { name: '白板列表' })
    .getByRole('button', { name })
    .click()
  await expect(page.getByRole('button', { name: '切换白板' })).toContainText(
    name,
  )
}

test('reuses one card across boards and restores it from trash', async ({
  page,
}) => {
  await page.goto('/')
  const first = page.locator('[data-world-item]').first()
  const cardId = await first.getAttribute('data-card-id')

  await page.getByRole('button', { name: '切换白板' }).click()
  const boardMenu = page.getByRole('menu', { name: '白板列表' })
  await boardMenu.getByLabel('新白板名称').fill('复用板')
  await boardMenu.getByRole('button', { name: '新建' }).click()
  await switchBoard(page, '我的白板')

  const source = page
    .locator(`[data-world-item][data-card-id="${cardId}"]`)
    .first()
  await source.locator('h2').click()
  await source.getByRole('button', { name: '加入其他白板' }).click()
  const picker = page.locator('[data-board-picker]')
  await picker
    .locator('[data-placement-board]')
    .filter({ hasText: '复用板' })
    .click()

  await page
    .getByRole('status')
    .filter({ hasText: '已加入「复用板」' })
    .getByRole('button', { name: '前往' })
    .click()
  await expect(page.getByRole('button', { name: '切换白板' })).toContainText(
    '复用板',
  )

  const reused = page.locator(`[data-world-item][data-card-id="${cardId}"]`)
  await expect(reused).toHaveCount(1)
  await reused.locator('h2').click()
  await reused.getByRole('button', { name: '编辑卡片' }).click()
  await page.getByLabel('卡片正文').fill('跨白板共享后的正文')
  await page.keyboard.press('Control+Enter')

  await switchBoard(page, '我的白板')
  await expect(
    page.locator(`[data-world-item][data-card-id="${cardId}"]`),
  ).toContainText('跨白板共享后的正文')

  const mainCard = page.locator(`[data-world-item][data-card-id="${cardId}"]`)
  await mainCard.locator('h2').click()
  await mainCard.getByRole('button', { name: '删除卡片' }).click()
  const deleteDialog = page.locator('[data-delete-card-dialog]')
  await expect(deleteDialog).toContainText('2 块白板')
  await deleteDialog.locator('[data-delete-from-board]').click()
  await expect(
    page.locator(`[data-world-item][data-card-id="${cardId}"]`),
  ).toHaveCount(0)

  await switchBoard(page, '复用板')
  await expect(
    page.locator(`[data-world-item][data-card-id="${cardId}"]`),
  ).toContainText('跨白板共享后的正文')

  const shared = page.locator(`[data-world-item][data-card-id="${cardId}"]`)
  await shared.locator('h2').click()
  await shared.getByRole('button', { name: '删除卡片' }).click()
  await expect(deleteDialog.locator('[data-delete-from-board]')).toHaveCount(0)
  await deleteDialog.locator('[data-delete-card-all]').click()
  await expect(
    page.locator(`[data-world-item][data-card-id="${cardId}"]`),
  ).toHaveCount(0)

  await page.getByRole('button', { name: '数据与备份' }).click()
  await page.getByRole('menuitem', { name: '回收站' }).click()
  const trash = page.locator('[data-trash-modal]')
  await expect(trash.locator('[data-trash-card]')).toHaveCount(1)
  await trash.locator('[data-trash-restore]').click()
  await expect(trash.locator('[data-trash-card]')).toHaveCount(0)
  await trash.getByRole('button', { name: '关闭回收站' }).click()

  const restored = page.locator(`[data-world-item][data-card-id="${cardId}"]`)
  await expect(restored).toBeVisible()
  await restored.locator('h2').click()
  await restored.getByRole('button', { name: '编辑卡片' }).click()
  await page.getByRole('button', { name: '查看历史版本' }).click()
  const history = page.locator('[data-card-history]')
  await expect(history).toBeVisible()
  await expect(history.locator('[data-card-version]')).not.toHaveCount(0)
})
