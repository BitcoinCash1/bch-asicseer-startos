import { VersionInfo } from '@start9labs/start-sdk'

export const v_1_5_4_1 = VersionInfo.of({
  version: '1.5.4:1',
  releaseNotes:
    'Add "Disable Developer Donation" toggle to configuration. ' +
    'The upstream disable_dev_donation config key (added by Calin Culianu himself) ' +
    'is now exposed in the Start9 UI. Default is off (donation active). ' +
    'When enabled, the full pool fee goes to your payout address.',
  migrations: {
    up: async ({ effects }) => {},
    down: async ({ effects }) => {},
  },
})
