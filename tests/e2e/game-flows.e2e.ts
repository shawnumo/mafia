import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const sevenPlayers = Array.from({ length: 7 }, (_, index) => `Player ${String(index + 1).padStart(2, '0')}`)
const roleNames = ['mafia', 'civilian', 'doctor', 'detective', 'sheriff']
const publicRoleText = /\b(?:mafia|civilian|doctor|detective|sheriff)\b/i

async function confirmDialog(page: Page, name: string | RegExp) {
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name }).click()
  await expect(dialog).toHaveCount(0)
}

async function phase(page: Page): Promise<string | null> {
  return page.locator('main[data-phase]').getAttribute('data-phase')
}

async function completeSetup(page: Page, variant: 'roleless' | 'roles', playerCount = 7) {
  if (variant === 'roles') {
    await page.getByRole('group', { name: 'Game variant' }).getByRole('button', { name: /^Roles/ }).click()
  }
  await setPlayerCount(page, playerCount)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Role balance' })).toBeVisible()
  await page.getByRole('button', { name: variant === 'roleless' ? /Start no-roles game/ : /Assign roles/ }).click()
}

/** The roster starts with seven playing seats; add placeholder players until the count is reached. */
async function setPlayerCount(page: Page, playerCount: number) {
  const count = page.getByTestId('playing-count')
  const current = async () => Number((await count.innerText()).split(' ')[0])
  while (await current() < playerCount) await page.getByRole('button', { name: 'Add player' }).click()
  await expect(count).toHaveText(new RegExp(`^${playerCount} playing`))
}

function nightTarget(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true })
}

async function peek(page: Page): Promise<string> {
  const peekButton = page.getByRole('button', { name: 'Press and hold to peek at role' })
  await peekButton.hover()
  await page.mouse.down()
  const role = (await peekButton.innerText()).trim().toLowerCase()
  await page.mouse.up()
  await expect(peekButton).toHaveText('Hold to peek')
  return role
}

async function revealAssignments(page: Page, players: string[], variant: 'roleless' | 'roles') {
  const assignments: Record<string, string> = {}
  for (const [index, player] of players.entries()) {
    await expect(page.getByText(`Player ${index + 1} of ${players.length}`)).toBeVisible()
    await expect(page.getByRole('heading', { name: player })).toBeVisible()
    expect((await page.locator('main').innerText()).toLowerCase()).not.toMatch(publicRoleText)
    await expect(page.getByRole('button', { name: 'Undo last action' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Exit/ })).toHaveCount(0)

    const role = await peek(page)
    expect(variant === 'roleless' ? ['mafia', 'civilian'] : roleNames).toContain(role)
    assignments[player] = role

    await page.getByRole('button', { name: 'I am done viewing' }).click()
    // Once confirmed, the next holder cannot peek at this player's role.
    await expect(page.getByRole('button', { name: 'Role hidden' })).toBeDisabled()
    expect((await page.locator('main').innerText()).toLowerCase()).not.toMatch(publicRoleText)

    const last = index === players.length - 1
    await page.getByRole('button', { name: last ? (variant === 'roles' ? /Start night/ : /Start discussion/) : /Next player/ }).click()
    if (last) await confirmDialog(page, variant === 'roles' ? 'Start night' : 'Start discussion')
  }
  return assignments
}

async function completeVoting(page: Page, preferredTargets: string[] = []) {
  for (let step = 0; step < 16; step += 1) {
    const currentVoter = await page.getByTestId('current-voter').innerText()
    if (currentVoter === 'All votes entered') break
    const names = await page.getByTestId('vote-target-name').allInnerTexts()
    const target = preferredTargets.find((name) => names.includes(name)) ?? names[0]
    await page.getByTestId('vote-target').filter({ hasText: target }).click()
  }
  await expect(page.getByTestId('current-voter')).toHaveText('All votes entered')
}

async function resolveVote(page: Page) {
  await page.getByRole('button', { name: 'Resolve vote' }).click()
  await confirmDialog(page, 'Resolve vote')
}

async function resolveNight(page: Page, assignments: Record<string, string>) {
  const civilians = Object.keys(assignments).filter((player) => assignments[player] === 'civilian')
  const doctor = Object.keys(assignments).find((player) => assignments[player] === 'doctor')
  const targets = await page.getByTestId('night-target').allInnerTexts()
  const mafiaTarget = civilians.find((name) => targets.includes(name))
  if (!mafiaTarget || !doctor) throw new Error('Expected a living civilian and doctor.')

  await nightTarget(page, mafiaTarget).click()
  await page.getByRole('button', { name: /Confirm mafia kill/ }).click()
  await nightTarget(page, doctor).click()
  await page.getByRole('button', { name: /Resolve night/ }).click()
  await confirmDialog(page, 'Resolve night')
  await expect(page.getByRole('heading', { name: 'What happened overnight?' })).toBeVisible()
}

test('guided setup blocks duplicate names and explains the problem', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('textbox', { name: 'Player 7 name' }).fill('Player 01')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page.getByText('Player names must be unique.')).toBeVisible()
  await expect(page.getByRole('button', { name: /Start no-roles game/ })).toBeDisabled()

  await page.getByRole('button', { name: 'Back' }).click()
  await page.getByRole('button', { name: 'Back' }).click()
  await page.getByRole('textbox', { name: 'Player 7 name' }).fill('Player 07')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText('Setup checks passed. This game is ready to start.')).toBeVisible()
  await expect(page.getByRole('button', { name: /Start no-roles game/ })).toBeEnabled()
})

test('the detective follows the role table default and the roster survives a reload', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('textbox', { name: 'Player 1 name' }).fill('Ada')
  await page.getByRole('group', { name: 'Game variant' }).getByRole('button', { name: /^Roles/ }).click()
  await setPlayerCount(page, 9)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('checkbox', { name: /Detective/ })).toBeChecked()

  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Player 1 name' })).toHaveValue('Ada')
})

test('the private reveal hides the role on pointer cancel and Exit always asks first', async ({ page }) => {
  await page.goto('./')
  await completeSetup(page, 'roles')
  const peekButton = page.getByRole('button', { name: 'Press and hold to peek at role' })
  await peekButton.hover()
  await page.mouse.down()
  await expect(peekButton).not.toHaveText('Hold to peek')
  await peekButton.dispatchEvent('pointercancel')
  await expect(peekButton).toHaveText('Hold to peek')
  await page.mouse.up()

  await page.getByRole('button', { name: 'Pause reveal (GM)' }).click()
  await confirmDialog(page, 'Pause reveal')
  await expect(page.getByRole('heading', { name: 'The reveal is hidden.' })).toBeVisible()
  expect((await page.locator('main').innerText()).toLowerCase()).not.toMatch(publicRoleText)
  await page.getByRole('button', { name: 'Resume reveal' }).click()

  const assignments = await revealAssignments(page, sevenPlayers, 'roles')
  expect(Object.values(assignments).filter((role) => role === 'mafia')).toHaveLength(2)

  await page.getByRole('button', { name: 'Exit game' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('heading', { name: 'Night time' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Night time' })).toBeVisible()
})

test('roleless game supports undo, restore, live tally, hides roles, and reaches a winner', async ({ page }) => {
  await page.goto('./')
  await completeSetup(page, 'roleless')
  const assignments = await revealAssignments(page, sevenPlayers, 'roleless')
  expect(await phase(page)).toBe('discussion')
  expect((await page.locator('main').innerText()).toLowerCase()).not.toMatch(publicRoleText)
  await expect(page.getByRole('button', { name: 'Undo last action' })).toBeDisabled()

  await page.reload()
  expect(await phase(page)).toBe('discussion')
  await page.getByRole('button', { name: /Start voting/ }).click()
  await confirmDialog(page, 'Start voting')

  const firstVoter = await page.getByTestId('current-voter').innerText()
  const firstTarget = await page.getByTestId('vote-target-name').first().innerText()
  await page.getByTestId('vote-target').first().click()
  await expect(page.getByText(`${firstVoter} voted for ${firstTarget}`, { exact: true })).toBeVisible()
  await expect(page.getByTestId('live-tally').getByRole('listitem').filter({ hasText: firstTarget })).toContainText('1 vote')
  await page.reload()
  await expect(page.getByText(`${firstVoter} voted for ${firstTarget}`, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Undo last action' }).click()
  await expect(page.getByTestId('current-voter')).toHaveText(firstVoter)
  await expect(page.getByText(/voted for/)).toHaveCount(0)

  await page.getByTestId('vote-target').first().click()
  await page.getByRole('button', { name: /Activity/ }).click()
  const activity = page.getByRole('dialog', { name: 'Game activity' })
  await expect(activity.getByText('Round 1 · voting started')).toBeVisible()
  await activity.getByRole('listitem').filter({ hasText: 'Round 1 · voting started' }).getByRole('button', { name: 'Restore' }).click()
  await confirmDialog(page, 'Restore checkpoint')
  await expect(page.getByTestId('current-voter')).toHaveText(firstVoter)
  await expect(page.getByText(/voted for/)).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('current-voter')).toHaveText(firstVoter)

  const mafia = sevenPlayers.filter((player) => assignments[player] === 'mafia')
  for (let round = 0; round < 7 && (await phase(page)) !== 'ended'; round += 1) {
    if ((await phase(page)) === 'discussion') {
      expect((await page.locator('main').innerText()).toLowerCase()).not.toMatch(publicRoleText)
      await page.getByRole('button', { name: /Start voting/ }).click()
      await confirmDialog(page, 'Start voting')
    }
    await completeVoting(page, mafia)
    await resolveVote(page)
    expect(await phase(page)).toBe('reveal')
    const next = page.getByRole('button', { name: /Start round|Show final board/ })
    const label = (await next.innerText()).replace('→', '').trim()
    await next.click()
    await confirmDialog(page, label)
  }

  await expect(page.getByRole('heading', { name: 'Town wins' })).toBeVisible()
  await page.getByRole('button', { name: /Activity/ }).click()
  const finalNote = page.getByRole('dialog', { name: 'Game activity' }).getByRole('textbox', { name: /GM note for/ }).first()
  await finalNote.fill('Reviewed the final vote.')
  await page.reload()
  await page.getByRole('button', { name: /Activity/ }).click()
  await expect(page.getByRole('dialog', { name: 'Game activity' }).getByRole('textbox', { name: /GM note for/ }).first()).toHaveValue('Reviewed the final vote.')
})

test('roles game resumes, keeps the record hidden until the end, supports undo, and reaches a winner', async ({ page }) => {
  await page.goto('./')
  await completeSetup(page, 'roles')
  const assignments = await revealAssignments(page, sevenPlayers, 'roles')
  await expect(page.getByRole('heading', { name: 'Night time' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Activity/ })).toHaveCount(0)

  await resolveNight(page, assignments)
  await expect(page.getByRole('button', { name: /Activity/ })).toHaveCount(0)
  expect((await page.locator('main').innerText()).toLowerCase()).not.toMatch(/\b(?:mafia|civilian|detective|sheriff)\b/)
  await page.getByRole('button', { name: 'Start Day 1' }).click()
  await confirmDialog(page, 'Start Day 1')
  await page.getByRole('button', { name: 'Undo last action' }).click()
  await expect(page.getByRole('heading', { name: 'What happened overnight?' })).toBeVisible()
  await page.getByRole('button', { name: 'Start Day 1' }).click()
  await confirmDialog(page, 'Start Day 1')
  await expect(page.getByRole('heading', { name: 'Open discussion' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Activity/ })).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Open discussion' })).toBeVisible()
  expect((await page.locator('main').innerText()).toLowerCase()).not.toMatch(publicRoleText)
  await page.getByRole('button', { name: /Start voting/ }).click()
  await confirmDialog(page, 'Start voting')

  const mafia = sevenPlayers.filter((player) => assignments[player] === 'mafia')
  await completeVoting(page, [mafia[0]])
  await resolveVote(page)
  await expect(page.getByText('Voted out')).toBeVisible()
  await page.getByRole('button', { name: 'Undo last action' }).click()
  await expect(page.getByTestId('current-voter')).toHaveText('All votes entered')
  await resolveVote(page)
  const firstOut = await page.locator('section h2').first().innerText()
  expect(mafia).toContain(firstOut)
  await page.getByRole('button', { name: /Start Night 2/ }).click()
  await confirmDialog(page, 'Start Night 2')

  await resolveNight(page, assignments)
  await page.getByRole('button', { name: 'Start Day 2' }).click()
  await confirmDialog(page, 'Start Day 2')
  await page.getByRole('button', { name: /Start voting/ }).click()
  await confirmDialog(page, 'Start voting')
  await completeVoting(page, mafia.filter((name) => name !== firstOut))
  await resolveVote(page)
  await page.getByRole('button', { name: /Show final board/ }).click()
  await confirmDialog(page, 'Show final board')

  await expect(page.getByRole('heading', { name: 'Town wins' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Game record' })).toBeVisible()
  await expect(page.getByText(/^Day 1: .+ was voted out\.$/)).toBeVisible()
  await page.getByRole('button', { name: /Activity/ }).click()
  await expect(page.getByRole('dialog', { name: 'Game activity' })).toBeVisible()
})

test('a 9-player roles game includes the detective and shows the answer only while held', async ({ page }) => {
  await page.goto('./')
  await completeSetup(page, 'roles', 9)
  const players = Array.from({ length: 9 }, (_, index) => `Player ${String(index + 1).padStart(2, '0')}`)
  const assignments = await revealAssignments(page, players, 'roles')
  expect(Object.values(assignments)).toContain('detective')

  const target = (await page.getByTestId('night-target').allInnerTexts())[0]
  await nightTarget(page, target).click()
  await page.getByRole('button', { name: /Confirm mafia kill/ }).click()
  await expect(page.getByRole('heading', { name: 'Detective check' })).toBeVisible()

  const guess = (await page.getByTestId('night-target').allInnerTexts())[0]
  await nightTarget(page, guess).click()
  const answer = page.getByRole('button', { name: "Press and hold to see the detective's answer" })
  await expect(answer).toHaveText('Hold for the answer')
  await answer.hover()
  await page.mouse.down()
  await expect(answer).toHaveText(assignments[guess] === 'mafia' ? '👍 Mafia' : '👎 Innocent')
  await page.mouse.up()
  await expect(answer).toHaveText('Hold for the answer')

  // Picks survive a reload mid-night, and Back returns to the earlier step.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Detective check' })).toBeVisible()
  await expect(nightTarget(page, guess)).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByRole('heading', { name: 'Mafia kill' })).toBeVisible()
})

test('game screens fit a 320px-wide phone without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto('./')
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(await overflow()).toBeLessThanOrEqual(0)
  await completeSetup(page, 'roleless')
  expect(await overflow()).toBeLessThanOrEqual(0)
  await revealAssignments(page, sevenPlayers, 'roleless')
  expect(await overflow()).toBeLessThanOrEqual(0)
  await page.getByRole('button', { name: /Start voting/ }).click()
  await confirmDialog(page, 'Start voting')
  expect(await overflow()).toBeLessThanOrEqual(0)
})

test('PWA manifest declares PNG and maskable icons and the cached shell opens offline', async ({ page, context }) => {
  await page.goto('./')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })

  const manifestResponse = await page.request.get('manifest.webmanifest')
  expect(manifestResponse.ok()).toBe(true)
  const manifest = await manifestResponse.json() as { icons: Array<{ sizes: string; type: string; purpose?: string }> }
  const pngIcons = manifest.icons.filter((icon) => icon.type === 'image/png')
  expect(pngIcons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']))
  expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true)
  expect((await page.request.get('apple-touch-icon.png')).ok()).toBe(true)

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Mafia' })).toBeVisible()
  await context.setOffline(false)
})
