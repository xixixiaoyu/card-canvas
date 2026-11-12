import { expect, test } from '@playwright/test'

test('AI semantic search is explicit and flies to a confirmed result', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'card-canvas:deepseek-config',
      JSON.stringify({
        apiKey: 'semantic-test-key',
        baseUrl: '/api/deepseek',
        model: 'deepseek-flash',
        enableWormhole: true,
        enableAutoTags: true,
        enableAutoTitle: true,
      }),
    )
  })
  let requests = 0
  await page.route('**/api/deepseek', async (route) => {
    requests += 1
    const request = route.request().postDataJSON() as {
      messages?: Array<{ content?: string }>
    }
    const system = request.messages?.[0]?.content ?? ''
    if (system.includes('查询改写器')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          choices: [
            {
              message: {
                content:
                  '{"terms":["讨好型人格","边界感","冲突回避","情绪劳动"]}',
              },
            },
          ],
        }),
      })
      return
    }

    const user = request.messages?.at(-1)?.content ?? ''
    const candidates = JSON.parse(
      user.split('候选卡片：\n')[1]?.split('\n\n规则')[0] ?? '[]',
    ) as Array<{ id: string }>
    const targetId =
      candidates.find((candidate) => candidate.id === 'card-demo-002')?.id ??
      candidates[0]!.id
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                results: [
                  {
                    cardId: targetId,
                    score: 88,
                    reason: '这张卡具体讨论了边界与情绪劳动的关系。',
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
  await expect(page.locator('[data-world-item]')).toHaveCount(3)
  await expect(page.locator('.canvas-stage')).toHaveClass(/is-ready/)
  await page.keyboard.press('Control+f')
  const input = page.getByLabel('搜索卡片')
  await input.fill('不想得罪别人但又总是很累')
  expect(requests).toBe(0)

  await page.locator('[data-semantic-search]').click()
  const result = page.locator('[data-spotlight-result]').first()
  await expect(result).toBeVisible()
  await expect(result).toContainText('这张卡具体讨论了边界与情绪劳动的关系。')
  expect(requests).toBe(2)

  await result.click()
  await expect(page.getByLabel('搜索卡片')).toBeHidden()
  await expect(
    page.locator('[data-world-item]').filter({ hasText: '边界不是墙' }),
  ).toHaveClass(/is-selected/)
})

test('semantic search without a key opens AI settings and keeps local search', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)
  await expect(page.locator('.canvas-stage')).toHaveClass(/is-ready/)
  await page.keyboard.press('Control+f')
  await page.getByLabel('搜索卡片').fill('边界')
  await expect(page.locator('[data-spotlight-result]')).not.toHaveCount(0)

  await page.locator('[data-semantic-search]').click()
  await expect(page.getByRole('dialog', { name: 'AI 认知辅助' })).toBeVisible()
})
