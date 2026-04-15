import { setupManifest } from '@start9labs/start-sdk'

export const manifest = setupManifest({
  id: 'bch-asicseer',
  title: 'ASICSeer',
  license: 'GPL-3.0',
  packageRepo: 'https://github.com/BitcoinCash1/bch-asicseer-startos',
  upstreamRepo: 'https://github.com/cculianu/asicseer-pool',
  marketingUrl: 'https://github.com/cculianu/asicseer-pool',
  donationUrl: null,
  docsUrls: [
    'https://github.com/BitcoinCash1/bch-asicseer-startos/blob/master/README.md',
    'https://github.com/cculianu/asicseer-pool',
  ],
  description: {
    short: 'ASICSeer — BCH mining pool with pool & solo modes',
    long: 'ASICSeer is a Bitcoin Cash mining pool built on the ASICSeer fork of ckpool. It supports dual-mode operation: pool mining (shared rewards on port 3334) and solo mining (winner takes all on port 4568). Includes a built-in WebUI dashboard for real-time monitoring.',
  },
  volumes: ['main'],
  images: {
    asicseer: {
      source: { dockerBuild: {} },
      arch: ['x86_64', 'aarch64'],
      emulateMissingAs: 'x86_64',
    },
  },
  alerts: {
    install:
      'ASICSeer requires a running Bitcoin Cash full node (BCHN or Knuth). Make sure your node is fully synced before starting the pool.',
    update: null,
    uninstall:
      'Uninstalling ASICSeer will permanently delete pool configuration and statistics. Mining hardware will need to be reconfigured.',
    restore:
      'Restoring will overwrite your current pool configuration.',
    start: null,
    stop: 'Stopping ASICSeer will disconnect all active miners.',
  },
  dependencies: {
    'bitcoin-cash-node': {
      description:
        'Bitcoin Cash full node providing the JSON-RPC interface needed for mining. Supports BCHN and Knuth implementations.',
      optional: false,
      s9pk: null,
    },
  },
})
