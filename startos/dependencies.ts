import { autoconfig } from 'bitcoin-cash-node-startos/startos/actions/config/autoconfig'
import { sdk } from './sdk'

export const setDependencies = sdk.setupDependencies(async ({ effects }) => {
  await sdk.action.createTask(
    effects,
    'bitcoin-cash-node',
    autoconfig,
    'critical',
    {
      input: {
        kind: 'partial',
        value: {
          prune: null,
          txindex: true,
          zmqEnabled: true,
        },
      },
      reason:
        'Pruning must be disabled, txindex and ZMQ must be enabled for ASICSeer to function properly.',
      when: { condition: 'input-not-matches', once: false },
    },
  )

  return {
    'bitcoin-cash-node': {
      kind: 'running' as const,
      versionRange: '>=0.1.0:0',
      healthChecks: ['primary'],
    },
  }
})
