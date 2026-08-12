import { VersionInfo } from '@start9labs/start-sdk'

export const v_1_5_4_15 = VersionInfo.of({
  version: '1.5.4:15',
  releaseNotes:
    'Dashboard hashrate display: the Pool/Solo Hashrate now shows "0 H/s" when the pool is running with no active miners, instead of a bare "—" (which looked like missing data). "—" is now reserved for when the pool service has no stats at all. ' +
    'The Network Hashrate also falls back to a difficulty-derived estimate if the selected node omits networkhashps, so the Network card always populates.',
  migrations: {
    up: async ({ effects }) => {},
    down: async ({ effects }) => {},
  },
})
