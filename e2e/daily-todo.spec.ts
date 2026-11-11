import { expect, test } from '@playwright/test'

test('one-click daily todo creates a reusable task card for today', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  const today = await page.evaluate(() => {
    const date = new Date()
    const pad = (value: number) => String(value).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  })

  const dailyButton = page.getByRole('button', {
    name: '创建今日待办卡片',
  })
  await dailyButton.click()
  const capture = page.locator('[data-quick-capture]')
  await expect(capture).toBeVisible()
  await capture.getByRole('button', { name: '关闭速记' }).click()
  await expect(capture).toBeHidden()
  await expect(dailyButton).not.toBeFocused()

  await dailyButton.click()
  await expect(capture).toBeVisible()
  await expect(capture.getByLabel('卡片标题')).toHaveValue(today)
  const content = capture.getByLabel('卡片正文')
  await expect(content).toHaveValue('- [ ] ')
  await expect(content).toBeFocused()

  await content.pressSequentially('发布版本')
  await content.press('Enter')
  await expect(content).toHaveValue('- [ ] 发布版本\n- [ ] ')
  await content.pressSequentially('整理反馈')
  await page.keyboard.press('Control+Enter')
  await expect(capture).toBeHidden()

  const daily = page.locator('[data-world-item]').filter({ hasText: today })
  await expect(daily).toHaveCount(1)
  await expect(daily.locator('[data-filter-tag="待办/今日"]')).toBeVisible()
  await expect(
    daily.getByRole('button', { name: '完成待办：发布版本' }),
  ).toBeVisible()
  await expect(
    daily.getByRole('button', { name: '完成待办：整理反馈' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: '行动透镜，2 个待办' }),
  ).toBeVisible()

  await dailyButton.click()
  await expect(capture).toBeHidden()
  await expect(page.locator('[data-world-item]')).toHaveCount(4)
  await expect(daily).toHaveClass(/is-selected/)
  await expect(page.getByText('今天的待办卡已经在白板上')).toBeVisible()

  await page.reload()
  await expect(page.locator('[data-world-item]')).toHaveCount(4)
  await expect(
    page
      .locator('[data-world-item]')
      .filter({ hasText: today })
      .getByRole('button', { name: '完成待办：发布版本' }),
  ).toBeVisible()
})
