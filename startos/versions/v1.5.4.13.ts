import { VersionInfo } from '@start9labs/start-sdk'

export const v_1_5_4_13 = VersionInfo.of({
  version: '1.5.4:13',
  releaseNotes:
    'Settings now apply on save: changing the payout address (or any pool setting / node backend) restarts the service so the new asicseer config takes effect immediately — previously the change sat unused until a manual restart. ' +
    'Safety: the pool refuses to start without a configured payout address instead of silently falling back to an unspendable default address. ' +
    'Dashboard: the sync ring now reaches 100% on nodes that omit verificationprogress when synced (e.g. BCHD), stratum ports are read from the live config instead of being hard-coded, the node stats panel honors Tor mode, and the footer links to the correct asicseer-pool repository.',
  migrations: {
    up: async ({ effects }) => {},
    down: async ({ effects }) => {},
  },
})
