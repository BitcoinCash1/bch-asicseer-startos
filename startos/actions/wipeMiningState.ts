import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

export const wipeMiningState = sdk.Action.withoutInput(
  'wipe-mining-state',

  async () => ({
    name: i18n('Wipe Mining State'),
    description: i18n(
      'Clear the accumulated share counts and hashrate figures and restart the pool. Use it when a miner is stuck showing as idle or the statistics look wrong.',
    ),
    warning: i18n(
      'Every share count and hashrate figure goes back to zero, and connected miners briefly disconnect. Blocks already found are not affected.',
    ),
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  }),

  async ({ effects }) => {
    // Flagged rather than done here: the pool reloads its accumulated totals
    // from `{logdir}/pool/pool.status` on every start, so they have to be
    // deleted while it is stopped or they simply come back. `main` does that
    // before the daemons launch, and clears the flag.
    await storeJson.merge(effects, { wipePending: true })
    await effects.restart()
    return null
  },
)
