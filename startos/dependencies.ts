import { sdk } from './sdk'

export const setDependencies = sdk.setupDependencies(
  async ({ effects }) => ({
    bitcoincashd: {
      kind: 'running' as const,
      versionRange: '>=0.1.0:0',
      healthChecks: ['primary'],
    },
  }),
)
