import { VersionInfo } from '@start9labs/start-sdk'

export const v_1_5_4_18 = VersionInfo.of({
  version: '1.5.4:18',
  releaseNotes:
    'Payout-address problems now raise an actionable StartOS Task (a card that links straight to Configure) instead of only a cryptic error — created only when the address is missing or wrong for the node\'s network, and cleared automatically once it is valid. ' +
    'Dashboard "Best Share" now shows the all-time best share (bestshare_alltime) rather than the per-round value that resets to 0, so it reflects your true closest-to-a-block.',
  migrations: {
    up: async ({ effects }) => {},
    down: async ({ effects }) => {},
  },
})
