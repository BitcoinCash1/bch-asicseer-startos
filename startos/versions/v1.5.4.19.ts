import { VersionInfo } from '@start9labs/start-sdk'

export const v_1_5_4_19 = VersionInfo.of({
  version: '1.5.4:19',
  releaseNotes:
    'A wrong/empty payout address no longer crash-loops the service. Previously the network guard threw on every start, and StartOS auto-restarting a throwing main leaked a subcontainer mount set each cycle — which could exhaust the host mount namespace ("No space left on device") and leave services stuck on "Starting". The service now parks idle with a failing health check and the actionable Task card instead, and starts normally once the address is fixed.',
  migrations: {
    up: async ({ effects }) => {},
    down: async ({ effects }) => {},
  },
})
