import { sdk } from './sdk'
import { poolPort, soloPort, uiPort, rootDir, nodeHost, nodeMountpoint } from './utils'
import { storeJson } from './file-models/store.json'

export const main = sdk.setupMain(async ({ effects }) => {
  console.log('Starting ASICSeer!')

  const store = await storeJson.read().once()
  const payoutAddress = store?.payoutAddress ?? ''
  const poolFee = store?.poolFee ?? 1
  const poolIdentifier = store?.poolIdentifier ?? 'ASICSeer'
  const poolDifficulty = store?.poolDifficulty ?? 64

  // ── Mounts ───────────────────────────────────────────────────────
  const mounts = sdk.Mounts.of()
    .mountVolume({
      volumeId: 'main',
      subpath: null,
      mountpoint: rootDir,
      readonly: false,
    })
    .mountDependency({
      dependencyId: 'bitcoincashd',
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

  // ── Read node RPC credentials from mounted dependency ────────────
  let rpcUser = 'bitcoincashd'
  let rpcPassword = ''
  try {
    const result = await poolSub.exec([
      'cat',
      `${nodeMountpoint}/store.json`,
    ])
    if (result.exitCode === 0) {
      const nodeStore = JSON.parse(result.stdout.toString()) as {
        rpcUser?: string
        rpcPassword?: string
      }
      rpcUser = nodeStore.rpcUser ?? rpcUser
      rpcPassword = nodeStore.rpcPassword ?? rpcPassword
    }
  } catch {
    console.warn('Could not read bitcoincashd store.json — using defaults')
  }

  await storeJson.merge(effects, {
    nodeRpcUser: rpcUser,
    nodeRpcPassword: rpcPassword,
  })

  // ── Write ckpool config files ────────────────────────────────────
  // asicseer-pool requires pool_fee to be a JSON float (e.g. 1.0 not 1)
  const ensureFloat = (s: string) =>
    s.replace(/"pool_fee":\s*(\d+)(?!\.)/g, '"pool_fee": $1.0')

  const poolConf = ensureFloat(JSON.stringify(
    {
      btcd: [
        {
          url: `${nodeHost}:8332`,
          auth: rpcUser,
          pass: rpcPassword,
          notify: true,
        },
      ],
      bchaddress: payoutAddress || '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      bchsig: `/${poolIdentifier}/`,
      blockpoll: 100,
      update_interval: 30,
      serverurl: [`0.0.0.0:${poolPort}`],
      mindiff: 1,
      startdiff: poolDifficulty,
      maxdiff: 0,
      logdir: `${rootDir}/pool/log`,
      pool_fee: poolFee,
    },
    null,
    2,
  ))

  const soloConf = ensureFloat(JSON.stringify(
    {
      btcd: [
        {
          url: `${nodeHost}:8332`,
          auth: rpcUser,
          pass: rpcPassword,
          notify: true,
        },
      ],
      bchaddress: payoutAddress || '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      bchsig: `/${poolIdentifier}-solo/`,
      blockpoll: 100,
      update_interval: 30,
      serverurl: [`0.0.0.0:${soloPort}`],
      mindiff: 1,
      startdiff: poolDifficulty,
      maxdiff: 0,
      logdir: `${rootDir}/solo/log`,
      pool_fee: 0,
    },
    null,
    2,
  ))

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

  // ── Daemons ──────────────────────────────────────────────────────
  return sdk.Daemons.of(effects)
    .addDaemon('pool', {
      subcontainer: poolSub,
      exec: {
        command: [
          'pool-entrypoint.sh',
          'pool',
          `${rootDir}/pool/asicseer.conf`,
        ],
        sigtermTimeout: 30_000,
      },
      ready: {
        display: 'Pool Mining',
        fn: async () =>
          sdk.healthCheck.checkPortListening(effects, poolPort, {
            successMessage: `Pool mining stratum ready on port ${poolPort}`,
            errorMessage: 'Pool mining stratum starting...',
          }),
      },
      requires: [],
    })
    .addDaemon('solo', {
      subcontainer: soloSub,
      exec: {
        command: [
          'pool-entrypoint.sh',
          'solo',
          `${rootDir}/solo/asicseer.conf`,
        ],
        sigtermTimeout: 30_000,
      },
      ready: {
        display: 'Solo Mining',
        fn: async () =>
          sdk.healthCheck.checkPortListening(effects, soloPort, {
            successMessage: `Solo mining stratum ready on port ${soloPort}`,
            errorMessage: 'Solo mining stratum starting...',
          }),
      },
      requires: [],
    })
    .addDaemon('ui', {
      subcontainer: uiSub,
      exec: {
        command: ['ui-entrypoint.sh'],
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
