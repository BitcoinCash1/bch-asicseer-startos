import { configure } from './actions/configure'
import { asicseerConf } from './fileModels/asicseer.conf'
import { storeJson } from './fileModels/store.json'
import { i18n } from './i18n'
import { sdk } from './sdk'
import {
  Network,
  nodeMountpoint,
  nodeNetwork,
  nodeRpcBridge,
  poolPort,
  rootDir,
  uiPort,
} from './utils'

/** The fields `main` reads out of the selected node's own `store.json`. */
type NodeStore = {
  network?: string
  rpcUser?: string
  rpcPassword?: string
  fullySynced?: boolean
}

/**
 * Which chain an address belongs to, from its CashAddr prefix. The node is
 * deliberately not asked: Flowee's `validateaddress` is legacy-base58-only and
 * reports every CashAddr invalid, which would reject correct addresses. An
 * address with no prefix encodes no chain, so it is not judged here — the pool
 * still rejects a genuinely wrong one, which the health check surfaces.
 */
const addressChain = (
  address: string,
): 'mainnet' | 'test' | 'regtest' | null => {
  const a = address.trim().toLowerCase()
  if (a.startsWith('bitcoincash:')) return 'mainnet'
  if (a.startsWith('bchtest:')) return 'test'
  if (a.startsWith('bchreg:')) return 'regtest'
  return null
}

/** Testnet3, testnet4, scalenet and chipnet all use `bchtest:` addresses. */
const networkChain = (network: Network) =>
  network === 'mainnet' ? 'mainnet' : network === 'regtest' ? 'regtest' : 'test'

const addressPrefix = {
  mainnet: 'bitcoincash:',
  test: 'bchtest:',
  regtest: 'bchreg:',
}

export const main = sdk.setupMain(async ({ effects }) => {
  console.info(i18n('Starting ASICSeer'))

  // A mapped `.const()` read, so saving Configure or choosing a different node
  // backend restarts the pool onto the new settings by itself. The transient
  // flags below are deliberately outside it — `main` writes those, and writing
  // a value it reacts to would restart the service it just started.
  const settings = await storeJson
    .read((s) => ({
      node: s.nodePackageId,
      payoutAddress: s.payoutAddress.trim(),
      poolFee: s.poolFee,
      poolIdentifier: s.poolIdentifier,
      poolDifficulty: s.poolDifficulty,
      disableDevDonation: s.disableDevDonation,
      floweeRpcUser: s.floweeRpcUser,
      floweeRpcPassword: s.floweeRpcPassword,
    }))
    .const(effects)
  const node = settings?.node ?? 'bitcoincashd'

  const mounts = sdk.Mounts.of()
    .mountVolume({
      volumeId: 'main',
      subpath: null,
      mountpoint: rootDir,
      readonly: false,
    })
    .mountDependency({
      dependencyId: node,
      volumeId: 'main',
      subpath: null,
      mountpoint: nodeMountpoint,
      readonly: true,
    })

  const poolSub = sdk.SubContainer.of(
    effects,
    { imageId: 'asicseer' },
    mounts,
    'pool-sub',
  )
  const uiSub = sdk.SubContainer.of(
    effects,
    { imageId: 'asicseer' },
    mounts,
    'ui-sub',
  )

  const readNodeStore = async (): Promise<NodeStore | null> => {
    const res = await poolSub
      .exec(['cat', `${nodeMountpoint}/store.json`])
      .catch(() => null)
    if (!res || res.exitCode !== 0) return null
    try {
      return JSON.parse(res.stdout.toString()) as NodeStore
    } catch {
      return null
    }
  }

  const nodeStore = await readNodeStore()
  const reported = nodeStore?.network ?? 'mainnet'
  const network = nodeNetwork(reported)
  if (!network) {
    throw new Error(
      i18n('The selected node reports an unrecognized chain: ${chain}.', {
        chain: reported,
      }),
    )
  }

  const rpcAddress = await nodeRpcBridge(effects, node, network)

  // Flowee keeps only a hash of each RPC password, so the credential it is
  // dialed with is the one this package minted and registered on it.
  const rpcUser =
    node === 'flowee'
      ? (settings?.floweeRpcUser ?? '')
      : (nodeStore?.rpcUser ?? node)
  const rpcPassword =
    node === 'flowee'
      ? (settings?.floweeRpcPassword ?? '')
      : (nodeStore?.rpcPassword ?? '')

  const payoutAddress = settings?.payoutAddress ?? ''
  const payoutChain = addressChain(payoutAddress)

  /**
   * What to return when mining is impossible: one failing health check saying
   * what to fix, rather than a thrown `main`. Throwing crash-loops the service
   * under auto-restart, which leaks a subcontainer mount set on every cycle,
   * and the reactive reads above heal the moment the cause is addressed.
   */
  const blocked = (message: string) =>
    sdk.Daemons.of(effects).addHealthCheck('mining', {
      ready: {
        display: i18n('Mining'),
        fn: async () => ({ result: 'failure', message }) as const,
      },
      requires: [],
    })

  const raisePayoutTask = (reason: string) =>
    sdk.action.createOwnTask(effects, configure, 'critical', {
      replayId: 'payout-address',
      reason,
    })

  if (!payoutAddress) {
    const message = i18n(
      'No payout address is set. Open Configure and set the address a found block should pay to.',
    )
    await raisePayoutTask(message)
    return blocked(message)
  }

  if (payoutChain && payoutChain !== networkChain(network)) {
    const message = i18n(
      'The payout address does not belong to the chain the node is on (${chain}). Open Configure and set an address starting ${prefix}',
      { chain: network, prefix: addressPrefix[networkChain(network)] },
    )
    await raisePayoutTask(message)
    return blocked(message)
  }

  await sdk.action.clearTask(effects, 'payout-address')

  if (!rpcAddress) {
    return blocked(
      i18n(
        'The ${node} node is not reachable. The pool will start once it is installed and running.',
        { node },
      ),
    )
  }

  // The pool reloads its accumulated totals from `{logdir}/pool/pool.status` on
  // every start, so they survive a restart and have to be deleted here, before
  // the daemons launch. Shares counted against one chain's difficulty are
  // meaningless on another, so a chain change wipes them too.
  const flags = await storeJson.read().once()
  if (
    flags?.wipePending ||
    (flags?.lastNetwork && flags.lastNetwork !== network)
  ) {
    console.info(
      i18n('Clearing mining statistics (chain is now ${chain})', {
        chain: network,
      }),
    )
    await poolSub.exec(['sh', '-c', `rm -rf ${rootDir}/pool/log/*`])
  }
  await storeJson.merge(effects, { wipePending: false, lastNetwork: network })

  await asicseerConf.write(effects, {
    btcd: [{ url: rpcAddress, auth: rpcUser, pass: rpcPassword, notify: true }],
    bchaddress: payoutAddress,
    bchsig: `/${settings?.poolIdentifier ?? 'ASICSeer'}/`,
    blockpoll: 100,
    update_interval: 30,
    serverurl: [`0.0.0.0:${poolPort}`],
    mindiff: 1,
    startdiff: settings?.poolDifficulty ?? 42,
    // 0 is upstream's default and means the pool never caps a miner's
    // difficulty — vardiff follows whatever the hardware can sustain.
    maxdiff: 0,
    logdir: `${rootDir}/pool/log`,
    pool_fee: settings?.poolFee ?? 1,
    ...(settings?.disableDevDonation ? { disable_dev_donation: true } : {}),
  })

  /**
   * Whether the pool can actually build work, not just whether the port is
   * open. asicseer-pool holds the stratum port open while unable to get a block
   * template, so a bare port check reports a healthy pool that mines nothing.
   */
  const miningReady = async () => {
    const log = await poolSub
      .exec(['sh', '-c', `tail -n 20 ${rootDir}/pool/log/*.log 2>/dev/null`])
      .then((r) => r.stdout?.toString() ?? '')
      .catch(() => '')

    if (/invalid b(tc|ch)address/i.test(log)) {
      return {
        result: 'failure',
        message: i18n(
          'The node rejected the payout address. Open Configure and set one valid on ${chain}.',
          { chain: network },
        ),
      } as const
    }
    if (/No bitcoinds active/i.test(log)) {
      return {
        result: 'failure',
        message: i18n(
          'The node is not answering, so there is no work to mine.',
        ),
      } as const
    }

    return sdk.healthCheck.checkPortListening(effects, poolPort, {
      successMessage: i18n('Accepting miners on ${chain}', { chain: network }),
      errorMessage: i18n('Starting...'),
    })
  }

  return sdk.Daemons.of(effects)
    .addDaemon('pool', {
      subcontainer: poolSub,
      exec: {
        command: ['pool-entrypoint.sh', `${rootDir}/pool/asicseer.conf`],
        sigtermTimeout: 30_000,
      },
      ready: { display: i18n('Mining'), fn: miningReady },
      requires: [],
    })
    .addDaemon('ui', {
      subcontainer: uiSub,
      exec: { command: ['ui-entrypoint.sh'], sigtermTimeout: 10_000 },
      ready: {
        display: i18n('Web Dashboard'),
        fn: () =>
          sdk.healthCheck.checkPortListening(effects, uiPort, {
            successMessage: i18n('The dashboard is ready'),
            errorMessage: i18n('The dashboard is not ready'),
          }),
      },
      requires: [],
    })
    .addHealthCheck('node-status', {
      ready: {
        display: i18n('Node'),
        fn: async () => {
          // The node's chain lives in a file on its volume, which is not a
          // reactive source, so this is where a chain change is noticed. It is
          // checked for every node, including BCHN: BCHN does move its RPC port
          // with the chain, but the binding it moves off is left *disabled*
          // rather than removed, and a disabled binding still resolves to its
          // old address — so the bridge read does not go null and `main` is
          // never re-run by it (verified against bitcoincashd 29.0.0:10).
          const current = await readNodeStore()
          const moved = current?.network && nodeNetwork(current.network)
          if (moved && moved !== network) {
            console.info(
              i18n('The node switched from ${from} to ${to}. Restarting.', {
                from: network,
                to: moved,
              }),
            )
            await effects.restart()
            return { result: 'loading', message: null } as const
          }

          if (!current) {
            return {
              result: 'failure',
              message: i18n(
                'The node is not answering, so there is no work to mine.',
              ),
            } as const
          }

          // Mining on a node that has not caught up builds on a stale tip, so
          // any block found would be orphaned. Reported rather than enforced —
          // the pool is left running so its dashboard and miners stay usable.
          if (current.fullySynced === false) {
            return {
              result: 'loading',
              message: i18n(
                'The node is still syncing. Blocks found before it catches up would be rejected by the network.',
              ),
            } as const
          }

          return {
            result: 'success',
            message: i18n('Mining on ${chain}', { chain: network }),
          } as const
        },
      },
      requires: [],
    })
})
