import { autoconfig as bchnAutoconfig } from 'bitcoin-cash-node-startos/startos/actions/config/autoconfig'
import { autoconfig as bchdAutoconfig } from 'bitcoin-cash-daemon-startos/startos/actions/config/autoconfig'
import { autoconfig as knuthAutoconfig } from 'knuth-bch-startos/startos/actions/config/autoconfig'
import { sdk } from './sdk'
import { storeJson } from './file-models/store.json'

export const setDependencies = sdk.setupDependencies(async ({ effects }) => {
  const store = await storeJson.read().const(effects)
  const selectedNodePackageId = store?.nodePackageId ?? 'bitcoincashd'
  const nodePackageId = ['bitcoincashd', 'bchd', 'flowee', 'knuth-bch'].includes(selectedNodePackageId)
    ? selectedNodePackageId
    : 'bitcoincashd'

  // Purge stale tasks from previous node selections
  await sdk.action.clearTask(
    effects,
    'bitcoincashd:autoconfig',
    'bchd:autoconfig',
    'flowee:autoconfig',
    'knuth-bch:autoconfig',
    'bitcoincashd-autoconfig',
    'bchd-autoconfig',
    'flowee-autoconfig',
    'knuth-bch-autoconfig',
    'select-node',
    'bitcoincash:autoconfig',
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
      // Flowee: ASICSeer uses JSON-RPC only — no autoconfig needed.
    } else if (nodePackageId === 'knuth-bch') {
      // Knuth v1.3.0+ optional JSON-RPC. Force RPC on + full DB.
      // Classic getblocktemplate/submitblock still missing upstream
      // (only *light variants) — k-nuth/kth#616. Pool probe will fail
      // on GBT until that lands; autoconfig still gets the node ready.
      await sdk.action.createTask(effects, 'knuth-bch', knuthAutoconfig, 'critical', {
        input: {
          kind: 'partial',
          // @ts-ignore
          value: {
            databaseMode: 'full',
            rpcEnabled: true,
          },
        },
        reason:
          'Mining requires JSON-RPC enabled and full (non-pruned) database mode on Knuth.',
        when: { condition: 'input-not-matches', once: false },
      })
    } else {
      // BCHN: txindex=true implicitly enforces non-pruned operation and avoids prune null/0 mismatch.
      await sdk.action.createTask(effects, nodePackageId, bchnAutoconfig, 'critical', {
        input: {
          kind: 'partial',
          value: {
            txindex: true,
          },
        },
        reason:
          'Mining RPC requires BCHN in non-pruned mode with txindex enabled.',
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
      versionRange: '>=2026.2.0:0',
      healthChecks: ['primary'],
    }
  } else if (nodePackageId === 'knuth-bch') {
    deps['knuth-bch'] = {
      kind: 'running',
      versionRange: '>=1.3.0:0',
      healthChecks: ['primary'],
    }
  } else {
    deps[nodePackageId] = {
      kind: 'running',
      versionRange: '>=29.0.0:0',
      healthChecks: ['primary'],
    }
  }

  if ((store?.torMode ?? 'off') !== 'off') {
    deps['tor'] = {
      kind: 'running',
      versionRange: '>=0.0.0:0',
      healthChecks: ['primary'],
    }
  }

  return deps as any
})
