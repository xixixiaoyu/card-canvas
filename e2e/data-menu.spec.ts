import { expect, test } from '@playwright/test'

test('exports a backup and imports a card file', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  const dataButton = page.getByRole('button', { name: '数据与备份' })
  await dataButton.click()
  await expect(page.getByRole('menuitem', { name: /AI 认知辅助/ })).toHaveCount(
    0,
  )
  await expect(page.getByRole('button', { name: /AI 认知辅助/ })).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: /导出工作区备份/ }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(
    /^card-canvas-backup-\d{4}-\d{2}-\d{2}\.json$/,
  )

  await dataButton.click()
  const backup = {
    app: 'card-canvas',
    version: 1,
    exportedAt: new Date().toISOString(),
    cards: [
      {
        id: 'card-e2e-imported',
        title: '导入的卡片',
        content: '来自备份文件',
        tags: ['Import', 'import'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    boardItems: [],
    connections: [],
  }

  await page.setInputFiles('input[aria-label="选择要导入的备份文件"]', {
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  })

  const imported = page
    .locator('[data-world-item]')
    .filter({ hasText: '导入的卡片' })
  await expect(imported).toHaveCount(1)
  await expect(page.locator('[data-world-item]')).toHaveCount(4)
})
