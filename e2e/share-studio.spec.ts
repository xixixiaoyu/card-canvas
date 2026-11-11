import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

test('share studio switches visual presets and exports a full-size PNG', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  const card = page.locator('[data-world-item]').first()
  await card.locator('h2').click()
  await card.getByRole('button', { name: '分享卡片图片' }).click()

  const studio = page.locator('[data-share-studio]')
  await expect(studio).toBeVisible()
  const preview = studio.locator('[data-share-preview]')
  await expect(preview.locator('[data-share-artwork]')).toHaveAttribute(
    'data-share-theme',
    'dawn',
  )
  await expect(preview.locator('[data-share-artwork]')).toHaveAttribute(
    'data-share-ratio',
    'square',
  )

  await studio.getByRole('button', { name: '主题：午夜墨' }).click()
  await studio.getByRole('button', { name: '比例：3:4，竖版海报' }).click()
  await studio.getByRole('switch', { name: '显示标签' }).click()

  await expect(preview.locator('[data-share-artwork]')).toHaveAttribute(
    'data-share-theme',
    'midnight',
  )
  await expect(preview.locator('[data-share-artwork]')).toHaveAttribute(
    'data-share-ratio',
    'portrait',
  )
  await expect(preview.locator('.share-artwork__tags')).toHaveCount(0)
  await expect(studio).toContainText('1080 × 1440 px')

  const downloadPromise = page.waitForEvent('download')
  await studio.getByRole('button', { name: '下载 PNG' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(
    /^card-canvas_.+_midnight_portrait\.png$/,
  )

  const filePath = await download.path()
  expect(filePath).toBeTruthy()
  const png = await readFile(filePath!)
  expect(png.subarray(1, 4).toString()).toBe('PNG')
  expect(png.byteLength).toBeGreaterThan(10_000)
  expect(png.readUInt32BE(16)).toBe(1080)
  expect(png.readUInt32BE(20)).toBe(1440)

  await page.keyboard.press('Escape')
  await expect(studio).toBeHidden()
})

test('share studio copies the rendered artwork when clipboard images are supported', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  const card = page.locator('[data-world-item]').first()
  await card.locator('h2').click()
  await card.getByRole('button', { name: '分享卡片图片' }).click()

  const studio = page.locator('[data-share-studio]')
  await studio.getByRole('button', { name: '复制图片' }).click()
  await expect(page.getByText('图片已复制到剪贴板。')).toBeVisible({
    timeout: 15_000,
  })
})

test('pointer close clears the share button focus while Escape restores it', async ({
  page,
}) => {
  await page.goto('/')
  const card = page.locator('[data-world-item]').first()
  await card.locator('h2').click()

  const share = card.getByRole('button', { name: '分享卡片图片' })
  await share.click()
  const studio = page.locator('[data-share-studio]')
  await studio.getByRole('button', { name: '关闭分享工作室' }).click()
  await expect(studio).toBeHidden()
  await expect(share).not.toBeFocused()

  await share.click()
  await expect(studio).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(studio).toBeHidden()
  await expect(share).toBeFocused()
})
