import type { OwnGoal, Shot } from '../types'

export interface Scorer {
  minute: number
  period: number
  name: string
  isPen: boolean
  isOwnGoal: boolean
}

/**
 * Goals credited to one side, in minute order. Shootout kicks are excluded;
 * own goals (exported separately, since they aren't shots) are listed under
 * the team they count for, named after the player who conceded them.
 */
export function getScorers(
  shots: Shot[],
  team: 'home' | 'away',
  ownGoals: OwnGoal[] = [],
): Scorer[] {
  const fromShots: Scorer[] = shots
    .filter(s => s.goal && s.team === team && !s.is_penalty_shootout && s.period !== 5 && s.minute != null)
    .map(s => ({
      minute: s.minute as number,
      period: s.period ?? ((s.minute as number) < 45 ? 1 : 2),
      name: s.player,
      isPen: s.shot_type === 'Penalty' || s.technique === 'Penalty',
      isOwnGoal: false,
    }))

  const fromOwnGoals: Scorer[] = ownGoals
    .filter(g => g.team === team && g.period !== 5 && g.minute != null)
    .map(g => ({ minute: g.minute as number, period: g.period ?? ((g.minute as number) < 45 ? 1 : 2), name: g.player, isPen: false, isOwnGoal: true }))

  // Period first: first-half stoppage (minute 46) precedes a 45th-minute
  // second-half goal. Sort is stable, so same-minute goals keep export order.
  return [...fromShots, ...fromOwnGoals].sort((a, b) => a.period - b.period || a.minute - b.minute)
}

// Regulation end of each period; anything past it is stoppage time.
const PERIOD_END: Record<number, number> = { 1: 45, 2: 90, 3: 105, 4: 120 }

/**
 * StatsBomb minutes are zero-based (0 = the first 60 seconds), so a goal at
 * minute 22 is 23' on the broadcast clock. Stoppage time reads 45+2', 90+3'.
 */
export function formatMinute(minute: number, period: number): string {
  const clock = minute + 1
  const end = PERIOD_END[period]
  return end && clock > end ? `${end}+${clock - end}'` : `${clock}'`
}
