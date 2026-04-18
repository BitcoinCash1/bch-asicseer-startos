import { autoconfig as bchnAutoconfig } from 'bitcoin-cash-node-startos/startos/actions/config/autoconfig'
import { autoconfig as bchdAutoconfig } from 'bitcoin-cash-daemon-startos/startos/actions/config/autoconfig'
import { autoconfig as floweeAutoconfig } from 'flowee-startos/startos/actions/config/autoconfig'
import { sdk } from './sdk'
import { storeJson } from './file-models/store.json'

export const setDependencies = sdk.setupDependencies(async ({ effects }) => {
  const store = await storeJson.read().const(effects)
  const nodePackageId = store?.nodePackageId ?? 'bitcoincashd'

  // Purge stale tasks from previous node selections
  await sdk.action.clearTask(
    effects,
    'bitcoincashd:autoconfig',
    'bchd:autoconfig',
    'flowee:autoconfig',
    'bitcoincashd-autoconfig',
    'bchd-autoconfig',
    'flowee-autoconfig',
  )

  if (store?.nodeConfirmed) {
    if (nodePackageId === 'bchd') {
      // BCHD: ensure pruning off (mining needs full chain)
      await sdk.action.createTask(effects, 'bchd', bchdAutoconfig, 'critical', {
        input: {
          kind: 'partial',
          value: {
            prune: 0,
          },
        },
        reason:
          'Pruning must be disabled for mining pool operation.',
        when: { condition: 'input-not-matches', once: false },
      })
    } else if (nodePackageId === 'flowee') {
      // Flowee: ensure REST API is on
      await sdk.action.createTask(effects, 'flowee', floweeAutoconfig, 'critical', {
        input: {
          kind: 'partial',
          value: {
            rest: true,
          },
        },
        reason:
          'REST API must be enabled for mining pool operation.',
        when: { condition: 'input-not-matches', once: false },
      })
    } else {
      // BCHN: ensure pruning off
      await sdk.action.createTask(effects, nodePackageId, bchnAutoconfig, 'critical', {
        input: {
          kind: 'partial',
          value: {
            prune: 0,
          },
        },
        reason:
          'Pruning must be disabled for mining pool operation.',
        when: { condition: 'input-not-matches', once: false },
      })
    }
  }

  const deps: Record<string, { kind: 'running'; versionRange: string; healthChecks: string[] }> = {}

  if (nodePackageId === 'bchd') {
    deps['bchd'] = {
      kind: 'running',
      versionRange: '>=0.21.1:0',
      healthChecks: ['primary'],
    }
  } else if (nodePackageId === 'flowee') {
    deps['flowee'] = {
      kind: 'running',
      versionRange: '>=1.0.0:0',
      healthChecks: ['primary'],
    }
  } else {
    deps[nodePackageId] = {
      kind: 'running',
      versionRange: '>=29.0.0:0',
      healthChecks: ['primary'],
    }
  }

  return deps as any
})
