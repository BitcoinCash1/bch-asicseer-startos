import { sdk } from '../sdk'
import { storeJson } from '../file-models/store.json'

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
    // Flag the wipe; main.ts deletes the persisted pool stats on the next start
    // BEFORE the daemons relaunch. A bare restart is not enough — asicseer-pool
    // reloads accounted_diff_shares/best_diff/hashrates from
    // {logdir}/pool/pool.status, so the old numbers would simply come back.
    await storeJson.merge(effects, { wipePending: true })
    await effects.restart()
    return null
  },
)
