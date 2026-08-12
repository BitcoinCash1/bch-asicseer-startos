import { VersionInfo } from '@start9labs/start-sdk'

export const v_1_5_4_12 = VersionInfo.of({
  version: '1.5.4:12',
  releaseNotes: 'Fix Flowee the Hub as node backend: use per-network RPC port (e.g. 48332 on chipnet) instead of hardcoded 8332. Remove incorrect REST API autoconfig requirement — ASICSeer uses JSON-RPC only.',
  migrations: {
    up: async ({ effects }) => {},
    down: async ({ effects }) => {},
  },
})
