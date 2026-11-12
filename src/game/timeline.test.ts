import { describe, expect, it } from 'vitest'
import { appendTimelineEntry, previousTimelineEntry, restoreTimelineEntry, TIMELINE_LIMIT, updateTimelineNote } from './timeline'
import type { TimelineEntry } from './timeline'

function entry(id: string, game = id): TimelineEntry<string, number> {
  return { id, timestamp: '2026-11-06T00:00:00.000Z', label: `Label ${id}`, note: '', game, timer: 0 }
}

describe('app timeline', () => {
  it('keeps only the most recent checkpoints', () => {
    const entries = Array.from({ length: TIMELINE_LIMIT + 5 }, (_, index) => entry(String(index)))
      .reduce<TimelineEntry<string, number>[]>((current, next) => appendTimelineEntry(current, next), [])

    expect(entries).toHaveLength(TIMELINE_LIMIT)
    expect(entries[0].id).toBe('5')
  })

  it('updates a note without changing the snapshot', () => {
    const updated = updateTimelineNote([entry('a'), entry('b')], 'b', 'Checked the vote')
    expect(updated[1]).toMatchObject({ id: 'b', note: 'Checked the vote', game: 'b' })
    expect(updated[0].note).toBe('')
  })

  it('restores a checkpoint and drops everything after it', () => {
    const result = restoreTimelineEntry([entry('a'), entry('b'), entry('c')], 'b')
    expect(result.entries.map((item) => item.id)).toEqual(['a', 'b'])
    expect(result.snapshot).toEqual({ game: 'b', timer: 0 })
    expect(restoreTimelineEntry([entry('a')], 'missing').snapshot).toBeNull()
  })

  it('treats undo as the checkpoint before the current one', () => {
    expect(previousTimelineEntry([entry('a')])).toBeNull()
    expect(previousTimelineEntry([entry('a'), entry('b')])?.id).toBe('a')
  })
})
