# ASICSeer

## Documentation

- [asicseer-pool](https://github.com/cculianu/asicseer-pool) — the upstream pool server, its configuration reference and release notes.

## What you get on StartOS

A mining pool and a dashboard, both fed by a Bitcoin Cash node running on this server.

Every block the pool finds is split in its coinbase between the miners that worked on it and paid straight to the addresses they connected with, so you can run this for other people as well as yourself. You take a fee you set — or none. The payout address you configure receives that fee.

## Getting set up

1. **Install a Bitcoin Cash node first** and let it finish syncing. Bitcoin Cash Node, Bitcoin Cash Daemon and Flowee the Hub all work. Mining against a node that has not caught up produces blocks the network will reject.
2. Run **Select Node Backend** and choose the node you installed. If you chose Flowee the Hub, a task appears on Flowee to register the login the pool will use — run it, then restart Flowee.
3. Run **Configure** and set your **Payout Address**. It has to belong to the same chain as your node: a `bitcoincash:` address for mainnet, `bchtest:` for the test chains, `bchreg:` for regtest. The pool will not mine until this is right, and the Mining health check tells you if it is not.
4. Start the service. The **Node** health check turns green once your node is synced and answering.
5. Run **Connection Info** and copy the address into your mining hardware.

## Using ASICSeer

### Pointing miners at the pool

**Connection Info** gives you the `stratum+tcp://` address along with the username and password format. Set the username to the Bitcoin Cash address you want that miner paid at, optionally followed by a dot and a name for the machine — `bitcoincash:qr….rig1`. Miners with no name are numbered `worker01`, `worker02` and so on. The password is not checked; anything will do.

### Web Dashboard

Current hashrate, accepted shares, connected workers, the best share found so far, and recent blocks. Workers appear a minute or two after they start submitting.

### Actions

- **Configure** — your payout address, the fee the pool keeps from each block, the identifier written into the coinbase of blocks you find, the difficulty new miners start at, and whether to keep the developer donation. Saving restarts the pool.
- **Select Node Backend** — switch which node the pool mines on. If the new node is on a different chain, the accumulated share and hashrate figures are cleared, because they do not carry across chains.
- **Connection Info** — the address and login format for your miners.
- **Wipe Mining State** — clears every share count and hashrate figure and restarts. Use it when a miner is stuck showing as idle or the statistics look wrong. Blocks already found are not affected.

## Limitations

There is no solo-mining mode — the upstream pool has none. Every block is always split between the miners that worked on it. Knuth is also not supported as a node backend; it serves mining templates through a different set of RPC calls than this pool knows how to make.
