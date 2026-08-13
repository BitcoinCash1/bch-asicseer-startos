import { T } from '@start9labs/start-sdk'
import { storeJson } from './fileModels/store.json'
import { sdk } from './sdk'
import { NODE_IDS, NodeId } from './utils'

/** The task a node carries on the pool's behalf, keyed `<packageId>:<actionId>`. */
const NODE_TASK_KEYS: Record<NodeId, string | null> = {
  // BCHN and BCHD need nothing beyond their defaults: none of the RPCs the
  // pool calls need a transaction index or an unpruned chain.
  bitcoincashd: null,
  bchd: null,
  flowee: 'flowee:create-dependent-credential',
  'knuth-bch': null,
}

/**
 * Gated on the node being up, not synced — `node-status` reports the latter,
 * which is more use than refusing to start for the days a sync takes.
 */
const NODE_DEPENDENCY: Record<NodeId, T.DependencyRequirement> = {
  bitcoincashd: {
    id: 'bitcoincashd',
    kind: 'running',
    versionRange: '>=29.0.0:10',
    healthChecks: ['primary'],
  },
  bchd: {
    id: 'bchd',
    kind: 'running',
    versionRange: '>=0.22.2:0',
    // Dialed through BCHD's plaintext proxy, not its self-signed TLS RPC, so
    // the proxy is the binding that has to be up.
    healthChecks: ['rpc-plaintext'],
  },
  flowee: {
    id: 'flowee',
    kind: 'running',
    // Where Flowee moved to hashed `rpcauth` and added the action below.
    versionRange: '>=2026.5.3:0',
    healthChecks: ['primary'],
  },
  'knuth-bch': {
    id: 'knuth-bch',
    kind: 'running',
    versionRange: '>=1.3.0',
    healthChecks: ['primary'],
  },
}

export const setDependencies = sdk.setupDependencies(async ({ effects }) => {
  const node =
    (await storeJson.read().const(effects))?.nodePackageId ?? 'bitcoincashd'

  // Drop the tasks for nodes the user is not on. The selected node's own key
  // is absent: clearing it here would race the task selectNode raises.
  await sdk.action.clearTask(
    effects,
    ...NODE_IDS.filter((id) => id !== node)
      .map((id) => NODE_TASK_KEYS[id])
      .filter((key): key is string => key !== null),
  )

  return { [node]: NODE_DEPENDENCY[node] }
})
