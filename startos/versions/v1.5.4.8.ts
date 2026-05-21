import { VersionInfo } from '@start9labs/start-sdk'

export const v_1_5_4_8 = VersionInfo.of({
  version: '1.5.4:8',
  releaseNotes: 'Move "Wipe Mining State" action to end of actions list.',
  migrations: {
    up: async ({ effects }) => {},
    down: async ({ effects }) => {},
  },
})
