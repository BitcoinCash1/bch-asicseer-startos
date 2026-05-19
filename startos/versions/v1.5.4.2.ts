import { VersionInfo } from '@start9labs/start-sdk'

export const v_1_5_4_2 = VersionInfo.of({
  version: '1.5.4:2',
  releaseNotes:
    'Add Delete button to worker table. ' +
    'Dead/inactive workers now remain visible in the Online Devices table until explicitly deleted. ' +
    'Clicking Delete removes the worker from stats immediately; the worker reappears automatically if it reconnects. ' +
    'Connected count badge continues to reflect live pool connections only.',
  migrations: {
    up: async ({ effects }) => {},
    down: async ({ effects }) => {},
  },
})
