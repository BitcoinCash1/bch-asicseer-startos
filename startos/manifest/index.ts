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
    bitcoincashd: {
      description:
        'Bitcoin Cash Node — C++ full node providing the JSON-RPC interface for mining.',
      optional: true,
      s9pk: null,
    },
    bchd: {
      description:
        'BCHD — Go-based full node providing the JSON-RPC interface for mining. An alternative to BCHN.',
      optional: true,
      s9pk: null,
    },
    flowee: {
      description:
        'Flowee the Hub — Fast BCH validator. Good for relay, but uses SPV-level validation. Not recommended as sole mining node.',
      optional: true,
      s9pk: null,
    },
    tor: {
      description:
        'StartOS Tor package providing SOCKS5 proxy support for optional onion-routed node RPC.',
      optional: true,
      s9pk: null,
    },
  },
})
