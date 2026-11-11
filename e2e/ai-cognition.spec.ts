import { expect, test, type Page } from '@playwright/test'

const AI_CONFIG_KEY = 'card-canvas:deepseek-config'

async function seedAIConfig(page: Page) {
  await page.addInitScript(
    ([key]) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          apiKey: 'test-deepseek-key',
          baseUrl: '/api/deepseek',
          model: 'deepseek-flash',
          enableWormhole: true,
          enableAutoTags: true,
          enableAutoTitle: true,
        }),
      )
    },
    [AI_CONFIG_KEY],
  )
}

test('AI settings validate connectivity and persist the local configuration', async ({
  page,
}) => {
  await page.route('**/api/deepseek', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [{ message: { content: 'OK' } }],
      }),
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'AI 认知辅助，尚未配置' }).click()

  const dialog = page.getByRole('dialog', { name: 'AI 认知辅助' })
  await expect(dialog).toBeVisible()
  await expect(
    dialog.getByRole('link', { name: '获取并充值 API Key' }),
  ).toHaveAttribute('href', 'https://platform.deepseek.com/api_keys')
  await expect(dialog.getByLabel('AI 模型')).toBeHidden()
  await dialog.locator('summary').click()
  await expect(dialog.getByLabel('AI 模型')).toHaveValue('deepseek-flash')
  await dialog.getByLabel('DeepSeek API Key').fill('test-ui-key')
  await expect(dialog.getByLabel('DeepSeek API Key')).toHaveAttribute(
    'type',
    'text',
  )
  await expect(dialog.getByLabel('DeepSeek API Key')).toHaveClass(/is-masked/)
  await expect(page.locator('input[type="password"]')).toHaveCount(0)
  await dialog.getByRole('button', { name: '测试连接' }).click()
  await expect(dialog).toContainText('连接正常')

  await dialog.getByRole('button', { name: '保存设置' }).click()
  await expect(dialog).toBeHidden()

  const stored = await page.evaluate(
    (key) => localStorage.getItem(key),
    AI_CONFIG_KEY,
  )
  expect(stored).toContain('test-ui-key')
})

test('single-card radar creates a labelled connection that can be undone', async ({
  page,
}) => {
  await seedAIConfig(page)
  await page.route('**/api/deepseek', async (route) => {
    const request = route.request().postDataJSON() as {
      messages?: Array<{ content?: string }>
    }
    const userPrompt = request.messages?.at(-1)?.content ?? ''
    const candidateJson = userPrompt
      .split('【候选卡片】\n')[1]
      ?.split('\n\n严格规则')[0]
    const candidates = JSON.parse(candidateJson ?? '[]') as Array<{
      id: string
    }>

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                suggestions: [
                  {
                    targetId: candidates[0]!.id,
                    label: '两者都通过节律调节恢复自主神经平衡',
                    reason: '气息与神经节律共享同一套稳定机制。',
                    strength: 88,
                  },
                ],
              }),
            },
          },
        ],
      }),
    })
  })

  await page.goto('/')
  const cards = page.locator('[data-world-item]')
  await expect(cards).toHaveCount(3)

  const sourceCard = cards.nth(0)
  await sourceCard.locator('h2').click()
  await sourceCard.getByRole('button', { name: '寻找关联卡片' }).click()
  const radar = page.locator('[data-connection-radar]')
  await expect(radar).toBeVisible()
  await expect(radar.locator('[data-radar-suggestion]')).toHaveCount(1)
  await expect(radar.locator('[data-radar-label]')).toHaveText(
    '两者都通过节律调节恢复自主神经平衡',
  )

  await radar.locator('[data-radar-adopt]').click()
  await expect(page.locator('[data-line]')).toHaveCount(1)
  await expect(page.locator('.connection-label-pill')).toHaveText(
    '两者都通过节律调节恢复自主神经平衡',
  )

  await page.keyboard.press('Escape')
  await expect(radar).toBeHidden()
  const undo = page.getByRole('button', { name: '撤销' })
  await expect(undo).toHaveAttribute('title', /建立连线/)
  await undo.click()
  await expect(page.locator('[data-line]')).toHaveCount(0)
})

test('radar allows an empty AI verdict without creating connections', async ({
  page,
}) => {
  await seedAIConfig(page)
  await page.route('**/api/deepseek', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: '{"suggestions":[]}',
            },
          },
        ],
      }),
    })
  })

  await page.goto('/')
  const card = page.locator('[data-world-item]').first()
  await card.locator('h2').click()
  await card.getByRole('button', { name: '寻找关联卡片' }).click()

  const radar = page.locator('[data-connection-radar]')
  await expect(radar).toContainText('这次没有足够可靠的联系')
  await expect(radar.locator('[data-radar-suggestion]')).toHaveCount(0)
  await expect(page.locator('[data-line]')).toHaveCount(0)
})

test('background tag inference closes capture first and enriches labels later', async ({
  page,
}) => {
  await seedAIConfig(page)
  await page.route('**/api/deepseek', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [{ message: { content: '认知科学/节律调节' } }],
      }),
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: '打开速记' }).click()
  const dialog = page.locator('[data-quick-capture]')
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('卡片标题').fill('节律自检')
  await dialog.getByLabel('卡片正文').fill('观察呼吸与声音节律如何影响恢复。')
  await page.keyboard.press('Control+Enter')

  await expect(dialog).toBeHidden()
  const card = page.locator('[data-world-item]').filter({ hasText: '节律自检' })
  await expect(card).toBeVisible()
  await expect(
    card.locator('[data-filter-tag="认知科学/节律调节"]'),
  ).toBeVisible({ timeout: 8_000 })
})

test('capture can request tag suggestions before saving', async ({ page }) => {
  await seedAIConfig(page)
  await page.route('**/api/deepseek', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [{ message: { content: '声乐/共鸣' } }],
      }),
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: '打开速记' }).click()
  const dialog = page.locator('[data-quick-capture]')
  await dialog.getByLabel('卡片标题').fill('共鸣位置')
  await dialog.getByLabel('卡片正文').fill('观察软腭抬起后的高频泛音。')
  await dialog.getByRole('button', { name: 'AI 推荐标签' }).click()
  await expect(dialog).toContainText('#声乐/共鸣')

  await page.keyboard.press('Control+Enter')
  await expect(dialog).toBeHidden()
  await expect(
    page
      .locator('[data-world-item]')
      .filter({ hasText: '共鸣位置' })
      .locator('[data-filter-tag="声乐/共鸣"]'),
  ).toBeVisible()
})

test('background AI replaces the neutral title without delaying capture', async ({
  page,
}) => {
  await seedAIConfig(page)
  await page.route('**/api/deepseek', async (route) => {
    const request = route.request().postDataJSON() as {
      messages?: Array<{ role?: string; content?: string }>
    }
    const system = request.messages?.[0]?.content ?? ''
    const content = system.includes('标题编辑')
      ? '允许脆弱成为和解的入口'
      : '心理学/自我关系'

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [{ message: { content } }],
      }),
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: '打开速记' }).click()
  const dialog = page.locator('[data-quick-capture]')
  await dialog
    .getByLabel('卡片正文')
    .fill('真正的和解不是表演强大，而是允许脆弱重新被看见。')
  await page.keyboard.press('Control+Enter')
  await expect(dialog).toBeHidden()

  const card = page
    .locator('[data-world-item]')
    .filter({ hasText: '真正的和解不是表演强大' })
  await expect(card.locator('h2')).toHaveText('允许脆弱成为和解的入口', {
    timeout: 8_000,
  })
  await expect(card).toContainText('真正的和解不是表演强大')

  await page.reload()
  await expect(
    page
      .locator('[data-world-item]')
      .filter({ hasText: '真正的和解不是表演强大' })
      .locator('h2'),
  ).toHaveText('允许脆弱成为和解的入口')
})

test('capture uses a neutral title when AI is not configured', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: '打开速记' }).click()
  await page
    .getByLabel('卡片正文')
    .fill('没有标题时也不要直接把正文前半句拿来充当标题。')
  await page.keyboard.press('Control+Enter')

  const card = page
    .locator('[data-world-item]')
    .filter({ hasText: '没有标题时' })
  await expect(card.locator('h2')).toHaveText('未命名卡片')
})
