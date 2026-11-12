import { Dialog } from './Dialog'

const roleTable = [
  { players: '7–8', mafia: '2', specials: 'Doctor (roles game)', civilians: 'Rest' },
  { players: '9–11', mafia: '3', specials: 'Doctor, Detective', civilians: 'Rest' },
  { players: '12–13', mafia: '3', specials: 'Doctor, Detective', civilians: 'Rest' },
  { players: '14–15', mafia: '4', specials: 'Doctor, Detective', civilians: 'Rest' }
]

const sections = [
  {
    title: 'Setup',
    points: [
      'Pick a game without roles (mafia and civilians only) or with roles (doctor, detective, optional sheriff, run by a game master).',
      'The table above is the starting point. The GM may move the mafia count by one either way and turn each special role on or off.',
      'In a roles game every player privately holds the phone to see their role, confirms, and hands it back.'
    ]
  },
  {
    title: 'Night (roles game)',
    points: [
      'Order: mafia, then sheriff, then detective, then doctor. Each wakes, acts, and sleeps.',
      'Mafia must agree on one player to kill.',
      'The sheriff may shoot one player or abstain. Shooting a mafia member kills them. Shooting an innocent player kills the sheriff, and the doctor cannot stop that.',
      'The detective points at one player. The GM answers privately: thumbs up for mafia, thumbs down for innocent.',
      'The doctor protects one player, themselves included, and may repeat.'
    ]
  },
  {
    title: 'Morning',
    points: [
      'The GM names who died overnight. Night deaths never reveal their role.',
      'If the doctor saved the mafia target, the GM announces the save. A protection that changed nothing is never mentioned.',
      'The detective and their result are never announced.'
    ]
  },
  {
    title: 'Day and voting',
    points: [
      'Open discussion on the GM\'s clock.',
      'Every living player votes once, in a freshly shuffled order, and never for themselves. The GM sees the live tally and who voted for whom.',
      'Most votes is out. Voted-out players always reveal their role.'
    ]
  },
  {
    title: 'Ties',
    points: [
      'Each tied player gets their own defense, up to the defense time. They may finish early or waive it.',
      'Then everyone else votes to eliminate exactly one of the tied players. Tied players do not vote.',
      'If it ties again, repeat with the players still tied until someone is out. If every living player is tied, everyone votes again.'
    ]
  },
  {
    title: 'Winning',
    points: [
      'Town wins when no mafia remain.',
      'Mafia win as soon as they equal or outnumber everyone else.',
      'Checked after every death. At game end every role is revealed.'
    ]
  }
]

export function RulesReference({ onClose }: { onClose: () => void }) {
  return (
    <Dialog eyebrow="House rules" onClose={onClose} size="lg" title="Mafia reference">
      <button className="mb-5 min-h-11 rounded-full border border-ink/20 bg-white px-4 text-sm font-bold" onClick={onClose} type="button">Close</button>

      <div className="mb-6 overflow-x-auto rounded-2xl border border-ink/10 bg-white/75">
        <table className="w-full min-w-[28rem] text-left text-sm">
          <caption className="px-4 pt-4 text-left font-display text-xl font-bold">Starting roles</caption>
          <thead>
            <tr className="text-xs uppercase tracking-[0.12em] text-ink/60">
              <th className="px-4 py-2" scope="col">Players</th>
              <th className="px-4 py-2" scope="col">Mafia</th>
              <th className="px-4 py-2" scope="col">Special roles</th>
              <th className="px-4 py-2" scope="col">Civilians</th>
            </tr>
          </thead>
          <tbody>
            {roleTable.map((row) => (
              <tr className="border-t border-ink/10" key={row.players}>
                <th className="px-4 py-2 font-bold" scope="row">{row.players}</th>
                <td className="px-4 py-2">{row.mafia}</td>
                <td className="px-4 py-2">{row.specials}</td>
                <td className="px-4 py-2">{row.civilians}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-4 pb-4 text-xs text-ink/65">The sheriff is optional at any size. Games without roles use the same mafia counts and no special roles.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {sections.map((section) => (
          <section className="rounded-2xl border border-ink/10 bg-white/75 p-4" key={section.title}>
            <h3 className="font-display text-xl font-bold">{section.title}</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-base leading-7 text-ink/80">
              {section.points.map((point) => <li key={point}>{point}</li>)}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  )
}
