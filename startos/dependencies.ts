import { sdk } from './sdk'

export const setDependencies = sdk.setupDependencies(
  async ({ effects }) => ({
    'bitcoin-cash-node': {
      kind: 'running' as const,
      versionRange: '>=0.1.0:0',
      healthChecks: ['primary'],
    },
  }),
)
