import { VersionInfo } from '@start9labs/start-sdk'

export const v_1_5_4_6 = VersionInfo.of({
  version: '1.5.4:6',
  releaseNotes:
    'Fix: sharelog state is now cleared on every restart, so a normal service restart always resets miner difficulty to the configured starting value. Added "Reset Mining State" action for in-UI self-service reset.',
  migrations: {
    up: async ({ effects }) => {},
    down: async ({ effects }) => {},
  },
})
