import { expect, test } from '@playwright/test'

test('exports a backup and imports a card file', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  await page.locator('button[aria-label^="待整理池，"]').click()
  await expect(page.locator('#inbox-shelf')).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.locator('button[aria-label="导出工作区备份"]').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(
    /^card-canvas-backup-\d{4}-\d{2}-\d{2}\.json$/,
  )

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
    .locator('[data-inbox-card]')
    .filter({ hasText: '导入的卡片' })
  await expect(imported).toHaveCount(1)
  await expect(page.locator('[data-world-item]')).toHaveCount(3)
  await expect(page.locator('button[aria-label^="待整理池，"]')).toContainText(
    '1',
  )
})
