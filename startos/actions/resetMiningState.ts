import { sdk } from '../sdk'

export const resetMiningState = sdk.Action.withoutInput(
  'reset-mining-state',

  async ({ effects: _effects }) => ({
    name: 'Wipe Mining State',
    description:
      'Clears all sharelog data and restarts the pool. Use this if a miner is stuck showing Idle or stale statistics. On restart, all miners reconnect at the configured starting difficulty and vardiff adjusts naturally from there.',
    warning:
      'All accepted share counts and mining statistics will be reset to zero. Connected miners will briefly disconnect and reconnect.',
    allowedStatuses: 'any' as const,
    group: null,
    visibility: 'enabled' as const,
  }),

  async ({ effects }) => {
    await effects.restart()
    return null
  },
)
