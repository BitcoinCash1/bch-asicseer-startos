import { T } from '@start9labs/start-sdk'
import { storeJson } from './fileModels/store.json'
import { sdk } from './sdk'
import { NODE_IDS, NodeId } from './utils'

/** The task a node carries on the pool's behalf, keyed `<packageId>:<actionId>`. */
const NODE_TASK_KEYS: Record<NodeId, string | null> = {
  // BCHN and BCHD need no configuration beyond their defaults: the pool only
  // calls getblocktemplate, submitblock, validateaddress and the chain-info
  // reads, none of which need a transaction index or an unpruned chain.
  bitcoincashd: null,
  bchd: null,
  flowee: 'flowee:create-dependent-credential',
}

/**
 * Only the node the pool actually dials has to be up. It is deliberately gated
 * on the node's own liveness rather than its sync progress — a pool pointed at
 * a node that is still catching up is reported by this package's own
 * `node-status` health check, which is more use than refusing to start.
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
    // BCHD serves RPC over its own TLS with a self-signed certificate, so it is
    // dialed through its plaintext proxy daemon instead — that proxy, not the
    // native RPC, is the binding that has to be up.
    healthChecks: ['rpc-plaintext'],
  },
  flowee: {
    id: 'flowee',
    kind: 'running',
    // The release that moved RPC credentials to hashed `rpcauth` entries and
    // added the action this package registers its credential through.
    versionRange: '>=2026.5.2:12',
    healthChecks: ['primary'],
  },
}

export const setDependencies = sdk.setupDependencies(async ({ effects }) => {
  const node =
    (await storeJson.read().const(effects))?.nodePackageId ?? 'bitcoincashd'

  // Drop the tasks belonging to the nodes the user is not on, so none sits in
  // the task list against a node the pool no longer talks to. The selected
  // node's own key is deliberately absent: selecting Flowee writes the store,
  // which re-runs this, and clearing its key here would race the task the
  // action raises straight afterwards.
  await sdk.action.clearTask(
    effects,
    ...NODE_IDS.filter((id) => id !== node)
      .map((id) => NODE_TASK_KEYS[id])
      .filter((key): key is string => key !== null),
  )

  return { [node]: NODE_DEPENDENCY[node] }
})
