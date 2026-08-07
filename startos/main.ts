import { sdk } from './sdk'
import { poolPort, soloPort, uiPort, rootDir, nodeMountpoint } from './utils'
import { storeJson } from './file-models/store.json'
import { configure } from './actions/configure'

export const main = sdk.setupMain(async ({ effects }) => {
  console.log('Starting ASICSeer!')

  const store = await storeJson.read().once()
  const payoutAddress = (store?.payoutAddress ?? '').trim()
  const poolFee = store?.poolFee ?? 1
  const poolIdentifier = store?.poolIdentifier ?? 'ASICSeer'
  const poolDifficulty = store?.poolDifficulty ?? 42
  const disableDevDonation = store?.disableDevDonation ?? false
  const nodePackageId = store?.nodePackageId ?? 'bitcoincashd'

  const nodeAddressMode = store?.nodeAddressMode ?? 'auto'
  const customNodeHost = (store?.customNodeHost ?? '').trim()
  const customNodePort = store?.customNodePort ?? 8332
  const defaultNodeHost = `${nodePackageId}.startos`
  const nodeHost =
    nodeAddressMode === 'custom' && customNodeHost.length > 0
      ? customNodeHost
      : defaultNodeHost
  // BCHN, Flowee, and Knuth remap RPC port per network.
  // BCHD plaintext bridge is always 8334 in this package.
  // nodeNetwork is updated after reading the dependency store.json; nodePort is finalised then.
  const bitcoincashdRpcPorts: Record<string, number> = {
    mainnet: 8332, testnet3: 18332, testnet4: 28342,
    scalenet: 38332, chipnet: 48332, regtest: 18443,
  }
  let nodeNetwork = 'mainnet'
  let nodePort =
    nodeAddressMode === 'custom' && Number.isFinite(customNodePort) && customNodePort > 0
      ? customNodePort
      : 8332 // placeholder — replaced after store read

  const torMode = store?.torMode ?? 'off'
  const torProxyHost = (store?.torProxyHost ?? 'tor.startos').trim() || 'tor.startos'
  const torProxyPort = store?.torProxyPort ?? 9050
  const torEnabled = torMode !== 'off'
  const torProxyUrl = `socks5h://${torProxyHost}:${torProxyPort}`
  const rpcAuthMode = store?.rpcAuthMode ?? 'auto'
  const manualRpcUser = (store?.manualRpcUser ?? '').trim()
  const manualRpcPassword = store?.manualRpcPassword ?? ''

  // Surface payout-address problems as an actionable StartOS task (a card that
  // links the user straight to Configure). Created ONLY when something is
  // wrong, and cleared once the address is valid — no always-on task.
  const flagPayoutTask = async (reason: string) => {
    try {
      await sdk.action.createOwnTask(effects, configure, 'critical', {
        replayId: 'payout-address',
        reason,
      })
    } catch (e) {
      console.warn('could not create payout-address task:', e)
    }
  }
  const clearPayoutTask = async () => {
    try {
      await sdk.action.clearTask(effects, 'payout-address')
    } catch {}
  }

  // Refuse to start without a payout address. Previously an empty address
  // silently fell back to a hardcoded default (the genesis-block coinbase
  // address), which would send any found block's reward to an unspendable
  // address. Fail loudly (and raise a task) instead so the user sets one.
  if (!payoutAddress) {
    await flagPayoutTask(
      'Set your BCH payout address in Configure before the pool can mine.',
    )
    throw new Error(
      'No payout address configured. Open Configure and set your BCH Payout Address before starting.',
    )
  }

  // ── Mounts ───────────────────────────────────────────────────────
  const mounts = sdk.Mounts.of()
    .mountVolume({
      volumeId: 'main',
      subpath: null,
      mountpoint: rootDir,
      readonly: false,
    })
    .mountDependency({
      dependencyId: nodePackageId,
      volumeId: 'main',
      subpath: null,
      mountpoint: nodeMountpoint,
      readonly: true,
    } as any)

  // ── SubContainers ────────────────────────────────────────────────
  const poolSub = await sdk.SubContainer.of(
    effects,
    { imageId: 'asicseer' },
    mounts,
    'pool-sub',
  )

  const soloSub = await sdk.SubContainer.of(
    effects,
    { imageId: 'asicseer' },
    mounts,
    'solo-sub',
  )

  const uiSub = await sdk.SubContainer.of(
    effects,
    { imageId: 'asicseer' },
    mounts,
    'ui-sub',
  )

  // ── Read node RPC credentials and network from mounted dependency ─
  const maxStoreReadAttempts = 15
  let rpcUser = nodePackageId
  let rpcPassword = ''
  let storeReadOk = false
  for (let attempt = 1; attempt <= maxStoreReadAttempts; attempt++) {
    try {
      const result = await poolSub.exec([
        'cat',
        `${nodeMountpoint}/store.json`,
      ])
      if (result.exitCode === 0) {
        const nodeStore = JSON.parse(result.stdout.toString()) as {
          rpcUser?: string
          rpcPassword?: string
          network?: string
        }
        rpcUser = nodeStore.rpcUser ?? rpcUser
        rpcPassword = nodeStore.rpcPassword ?? rpcPassword
        nodeNetwork = nodeStore.network ?? nodeNetwork
        storeReadOk = true
        break
      }
    } catch {
      // Retry below.
    }

    console.warn(
      `Could not read ${nodeMountpoint}/store.json yet (attempt ${attempt}/${maxStoreReadAttempts})`,
    )
    await poolSub.exec(['sleep', '2'])
  }

  if (!storeReadOk) {
    throw new Error(
      `Dependency store.json was not readable at ${nodeMountpoint}/store.json`,
    )
  }

  // Finalise nodePort now that nodeNetwork is known.
  // BCHN / Flowee / Knuth: per-network ports. BCHD: plaintext bridge 8334.
  if (nodeAddressMode !== 'custom' || !(Number.isFinite(customNodePort) && customNodePort > 0)) {
    nodePort =
      nodePackageId === 'bchd'
        ? 8334
        : (bitcoincashdRpcPorts[nodeNetwork] ?? 8332) // bitcoincashd | flowee | knuth-bch
  }

  if (!rpcPassword) {
    console.warn('Node RPC password is empty in dependency store.json')
  }

  if (rpcAuthMode === 'manual' && manualRpcUser && manualRpcPassword) {
    rpcUser = manualRpcUser
    rpcPassword = manualRpcPassword
  }

  console.log(
    `RPC target=${nodeHost}:${nodePort} user=${rpcUser} passLength=${rpcPassword.length} torMode=${torMode}`,
  )

  const rpcCall = async (method: string, params: unknown[]) => {
    const args = [
      'curl',
      '-sS',
      '--fail',
      '--max-time',
      '5',
      '-u',
      `${rpcUser}:${rpcPassword}`,
      '-H',
      'Content-Type: application/json',
      '-d',
      JSON.stringify({ jsonrpc: '1.0', id: 'startos', method, params }),
      `http://${nodeHost}:${nodePort}`,
    ]

    if (torEnabled) {
      args.splice(2, 0, '--proxy', torProxyUrl)
    }

    return poolSub.exec(args)
  }

  const maxRpcProbeAttempts = 30
  let rpcReady = false
  let lastProbeFailure = ''
  for (let attempt = 1; attempt <= maxRpcProbeAttempts; attempt++) {
    try {
      const infoResult = await rpcCall('getblockchaininfo', [])
      const gbtResult = await rpcCall('getblocktemplate', [{}])

      const infoBody = infoResult.stdout.toString()
      const gbtBody = gbtResult.stdout.toString()
      const infoOk = infoResult.exitCode === 0 && infoBody.includes('"error":null')
      const gbtOk = gbtResult.exitCode === 0 && gbtBody.includes('"error":null')

      if (infoOk && gbtOk) {
        rpcReady = true
        break
      }

      lastProbeFailure = `RPC returned non-success JSON (infoExit=${infoResult.exitCode}, gbtExit=${gbtResult.exitCode})`
      if (
        gbtBody.includes('Method not found') ||
        gbtBody.includes('method not found') ||
        gbtBody.includes('-32601')
      ) {
        lastProbeFailure =
          nodePackageId === 'knuth-bch'
            ? 'Knuth mines via getblocktemplatelight/submitblocklight (v1.3.0), not classic getblocktemplate. ASICSeer still speaks classic GBT — see k-nuth/kth#616.'
            : 'Node rejected getblocktemplate (method not found). This pool needs classic GBT RPC.'
      } else if (gbtBody.includes('403') || infoBody.includes('403')) {
        lastProbeFailure =
          'HTTP 403 Forbidden from node RPC. Check rpcuser/rpcpassword and node RPC access controls.'
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('403')) {
        lastProbeFailure =
          'HTTP 403 Forbidden from node RPC. Credentials or RPC ACL are rejecting the request.'
      } else if (message.includes('401')) {
        lastProbeFailure =
          'HTTP 401 Unauthorized from node RPC. Credentials are incorrect.'
      } else if (message.includes('timed out')) {
        lastProbeFailure = 'RPC request timed out. Check connectivity and node health.'
      } else if (message.includes('Failed to connect')) {
        lastProbeFailure =
          'Cannot connect to node RPC endpoint. Check host, port, and selected network mode.'
      } else {
        lastProbeFailure = message
      }
    }

    console.warn(
      `Node RPC probe failed at ${nodeHost}:${nodePort} (attempt ${attempt}/${maxRpcProbeAttempts}): ${lastProbeFailure}`,
    )
    await poolSub.exec(['sleep', '2'])
  }

  if (!rpcReady) {
    throw new Error(
      `Node RPC at ${nodeHost}:${nodePort} did not become ready: ${lastProbeFailure}`,
    )
  }

  // ── Guard: payout address must match the node's network ───────────
  // Determine the address's network from its CashAddr prefix — reliable and
  // node-independent. We deliberately do NOT trust the node's validateaddress
  // here: Flowee the Hub's validateaddress RPC is legacy-base58-only and
  // returns isvalid=false for ANY cashaddr (verified), which would wrongly
  // reject valid addresses. A genuine wrong-network address is still caught at
  // runtime by the "invalid bchaddress" asicseer-pool log guard below.
  {
    const addrLower = payoutAddress.trim().toLowerCase()
    const addrNetClass =
      addrLower.startsWith('bitcoincash:')
        ? 'mainnet'
        : addrLower.startsWith('bchtest:')
          ? 'test'
          : addrLower.startsWith('bchreg:')
            ? 'regtest'
            : null // prefix-less cashaddr / legacy — network not encoded, don't block
    const nodeNetClass =
      nodeNetwork === 'mainnet'
        ? 'mainnet'
        : nodeNetwork === 'regtest'
          ? 'regtest'
          : 'test' // testnet / testnet4 / scalenet / chipnet all use bchtest:
    if (addrNetClass !== null && addrNetClass !== nodeNetClass) {
      const want =
        nodeNetwork === 'mainnet'
          ? 'a mainnet (bitcoincash:) address'
          : nodeNetwork === 'regtest'
            ? 'a regtest (bchreg:) address'
            : 'a testnet/chipnet (bchtest:) address'
      await flagPayoutTask(
        `Your payout address is not valid on the node's network (${nodeNetwork}). Open Configure and set ${want}.`,
      )
      // Park the service idle instead of throwing. A throwing setupMain
      // crash-loops under StartOS auto-restart and leaks a subcontainer mount
      // set every cycle, which can exhaust the mount namespace ("No space left
      // on device"). The Task card + failing health check guide the user; the
      // next restart after they fix the address re-runs main normally.
      return sdk.Daemons.of(effects).addDaemon('payout-guard', {
        subcontainer: poolSub,
        exec: {
          command: ['sh', '-c', 'while true; do sleep 3600; done'],
          sigtermTimeout: 5_000,
        },
        ready: {
          display: 'Pool Mining',
          fn: async () => ({
            result: 'failure' as const,
            message: `Payout address is not valid on the node's network (${nodeNetwork}) — open Configure and set ${want}.`,
          }),
        },
        requires: [],
      })
    }
    // Valid (or inconclusive RPC): clear any prior payout-address task.
    await clearPayoutTask()
  }

  // ── Wipe stale mining stats on request or after a network change ──
  // asicseer-pool persists cumulative stats (accounted_diff_shares, best_diff,
  // hashrate averages) to {logdir}/pool/pool.status and reloads them on every
  // restart, so a plain restart never clears them. Wipe the log trees when the
  // user runs "Wipe Mining State" (wipePending) or when the node's network
  // changed since the last start — stats from another network are meaningless
  // and make round-progress explode (e.g. mainnet shares / chipnet difficulty).
  const lastNetwork = store?.lastNetwork ?? ''
  const wipePending = store?.wipePending ?? false
  if (wipePending || (lastNetwork && lastNetwork !== nodeNetwork)) {
    console.log(
      `[wipe] clearing mining stats (wipePending=${wipePending}, lastNetwork=${lastNetwork || 'none'} -> ${nodeNetwork})`,
    )
    await poolSub.exec([
      'sh',
      '-c',
      `rm -rf ${rootDir}/pool/log/* ${rootDir}/solo/log/* 2>/dev/null || true`,
    ])
  }

  await storeJson.merge(effects, {
    nodeRpcUser: rpcUser,
    nodeRpcPassword: rpcPassword,
    wipePending: false,
    lastNetwork: nodeNetwork,
  })

  // ── Write ckpool config files ────────────────────────────────────
  // asicseer-pool requires pool_fee to be a JSON float (e.g. 1.0 not 1)
  const ensureFloat = (s: string) =>
    s.replace(/"pool_fee":\s*(\d+)(?!\.)/g, '"pool_fee": $1.0')

  const poolConf = ensureFloat(
    JSON.stringify(
      {
        btcd: [
          {
            url: `${nodeHost}:${nodePort}`,
            auth: rpcUser,
            pass: rpcPassword,
            notify: true,
          },
        ],
        bchaddress: payoutAddress,
        bchsig: `/${poolIdentifier}/`,
        blockpoll: 100,
        update_interval: 30,
        serverurl: [`0.0.0.0:${poolPort}`],
        mindiff: 1,
        startdiff: poolDifficulty,
        maxdiff: 0,
        logdir: `${rootDir}/pool/log`,
        pool_fee: poolFee,
        ...(disableDevDonation ? { disable_dev_donation: true } : {}),
      },
      null,
      2,
    ),
  )

  const soloConf = ensureFloat(
    JSON.stringify(
      {
        btcd: [
          {
            url: `${nodeHost}:${nodePort}`,
            auth: rpcUser,
            pass: rpcPassword,
            notify: true,
          },
        ],
        bchaddress: payoutAddress,
        bchsig: `/${poolIdentifier}-solo/`,
        blockpoll: 100,
        update_interval: 30,
        serverurl: [`0.0.0.0:${soloPort}`],
        mindiff: 1,
        startdiff: poolDifficulty,
        maxdiff: 0,
        logdir: `${rootDir}/solo/log`,
        pool_fee: 0,
        ...(disableDevDonation ? { disable_dev_donation: true } : {}),
      },
      null,
      2,
    ),
  )

  await poolSub.exec([
    'sh',
    '-c',
    `mkdir -p ${rootDir}/pool/log && cat > ${rootDir}/pool/asicseer.conf << 'EOCONF'\n${poolConf}\nEOCONF`,
  ])

  await poolSub.exec([
    'sh',
    '-c',
    `mkdir -p ${rootDir}/solo/log && cat > ${rootDir}/solo/asicseer.conf << 'EOCONF'\n${soloConf}\nEOCONF`,
  ])

  const proxyPrefix = torEnabled
    ? `export ALL_PROXY='${torProxyUrl}' HTTP_PROXY='${torProxyUrl}' HTTPS_PROXY='${torProxyUrl}'; `
    : ''

  // ── Network monitor ──────────────────────────────────────────────
  // When BCHN switches networks its RPC port changes. Restart main.ts
  // so the new port is picked up and asicseer config is rewritten.
  let netMonitorActive = true
  ;(async () => {
    while (netMonitorActive) {
      await new Promise<void>(r => setTimeout(r, 15_000))
      if (!netMonitorActive) break
      try {
        const result = await poolSub.exec(['cat', `${nodeMountpoint}/store.json`])
        if (result.exitCode === 0) {
          const s = JSON.parse(result.stdout.toString()) as { network?: string }
          if (s?.network && s.network !== nodeNetwork) {
            console.log(`[net-monitor] Node network changed ${nodeNetwork} -> ${s.network} — restarting service`)
            netMonitorActive = false
            await effects.restart()
            return
          }
        }
      } catch {}
    }
  })().catch(() => {})

  // Health that reflects whether the pool can actually serve work, not just
  // whether the port is open. asicseer-pool can hold the stratum port open
  // while unable to build work (wrong payout address, node unreachable) —
  // surface that as a failure instead of a misleading green.
  const miningReady =
    (sub: typeof poolSub, mode: 'pool' | 'solo', port: number, label: string) =>
    async () => {
      try {
        const res = await sub.exec([
          'sh',
          '-c',
          `tail -n 20 ${rootDir}/${mode}/log/*.log 2>/dev/null`,
        ])
        const log = res.stdout?.toString() ?? ''
        if (/invalid b(tc|ch)address/i.test(log)) {
          return {
            result: 'failure' as const,
            message: `${label}: payout address rejected by the node — open Configure and set a valid address for this network (${nodeNetwork}).`,
          }
        }
        if (/No bitcoinds active/i.test(log)) {
          return {
            result: 'failure' as const,
            message: `${label}: cannot get work from the node (No bitcoinds active) — check the node connection.`,
          }
        }
      } catch {
        // fall through to the port check
      }
      return sdk.healthCheck.checkPortListening(effects, port, {
        successMessage: `${label} stratum ready on port ${port} [${nodeNetwork}]`,
        errorMessage: `${label} stratum starting...`,
      })
    }

  // ── Daemons ──────────────────────────────────────────────────────
  return sdk.Daemons.of(effects)
    .addDaemon('pool', {
      subcontainer: poolSub,
      exec: {
        command: [
          'sh',
          '-c',
          `${proxyPrefix}exec pool-entrypoint.sh pool ${rootDir}/pool/asicseer.conf`,
        ],
        sigtermTimeout: 30_000,
      },
      ready: {
        display: 'Pool Mining',
        fn: miningReady(poolSub, 'pool', poolPort, 'Pool mining'),
      },
      requires: [],
    })
    .addDaemon('solo', {
      subcontainer: soloSub,
      exec: {
        command: [
          'sh',
          '-c',
          `${proxyPrefix}exec pool-entrypoint.sh solo ${rootDir}/solo/asicseer.conf`,
        ],
        sigtermTimeout: 30_000,
      },
      ready: {
        display: 'Solo Mining',
        fn: miningReady(soloSub, 'solo', soloPort, 'Solo mining'),
      },
      requires: [],
    })
    .addDaemon('ui', {
      subcontainer: uiSub,
      exec: {
        // Inherit the same Tor proxy env as the pool/solo daemons so the
        // stats-api.sh blockchain RPC polling honors Tor mode too (curl
        // respects ALL_PROXY/HTTP_PROXY). Without this the dashboard's node
        // panel would go blank when the node is only reachable over Tor.
        command: ['sh', '-c', `${proxyPrefix}exec ui-entrypoint.sh`],
        sigtermTimeout: 10_000,
      },
      ready: {
        display: 'Web UI',
        fn: async () =>
          sdk.healthCheck.checkPortListening(effects, uiPort, {
            successMessage: 'Web dashboard is ready',
            errorMessage: 'Web dashboard starting...',
          }),
      },
      requires: [],
    })
})
