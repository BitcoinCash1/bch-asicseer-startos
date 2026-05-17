# ASICSeer Mining Pool

ASICSeer is a Bitcoin Cash mining pool built on the
[asicseer-pool](https://github.com/cculianu/asicseer-pool) fork of ckpool. It
supports dual-mode operation — **pool mining** (proportional shared rewards) and
**solo mining** (winner takes all) — from a single installation on StartOS.

## What you get on StartOS

- A **Stratum pool server** on port 3334 for ASIC and GPU miners (pool mode).
- A **Stratum solo server** on port 4568 for miners competing independently (solo mode).
- A **Web UI dashboard** on port 81 showing real-time hashrate, shares, connected
  miners, and block history.
- Built-in **Tor** support — Stratum endpoints are accessible over Tor for private mining.
- Compatible with any standard Stratum-capable mining device.

## Prerequisites

ASICSeer requires a running and fully-synced Bitcoin Cash full node. Supported node
backends on StartOS:

- **Bitcoin Cash Node (BCHN)** — recommended. Fastest IBD, no special configuration needed.
- **Bitcoin Cash Daemon (BCHD)** — also supported.
- **Flowee the Hub** — also supported.
- **Knuth** — JSON-RPC is not yet available in the current upstream Knuth release;
  selecting it will surface an RPC error until Knuth ships its built-in RPC module.

Select your node backend via **Actions → Select Node Backend**. The pool reads the
node's RPC credentials automatically.

## Getting started

1. Install a BCH full node (BCHN recommended) and let it fully sync.
2. Install ASICSeer.
3. Run **Actions → Configure Pool** to set:
   - **Payout Address** — your BCH address to receive block rewards.
   - **Pool Fee** — percentage fee for pool mode (0–10%; solo is always 0%).
   - **Pool Identifier** — text embedded in coinbase transactions (your pool's name).
4. Point your mining hardware at the Stratum endpoints below.

## Connecting miners

Replace `<startos-lan-address>` with your StartOS device's LAN IP address.

| Mode | Stratum URL                                | Port |
|------|--------------------------------------------|------|
| Pool | `stratum+tcp://<startos-lan-address>:3334` | 3334 |
| Solo | `stratum+tcp://<startos-lan-address>:4568` | 4568 |

Most miners accept a URL in this form. Set the username field to your BCH payout
address (or any worker name); the password field can be anything (e.g. `x`).

For Tor access: open **Interfaces → Pool Mining Interface → Add Onion Service** in
StartOS to get a `.onion` Stratum address and configure your miner's SOCKS5 proxy.

## Pool vs solo

- **Pool mode** — all connected miners share a single block-finding effort. When a
  block is found the reward is split proportionally by shares submitted. Produces
  steady income with multiple miners.
- **Solo mode** — each miner competes independently. A miner that finds a block keeps
  the full reward. Variance is high — you may find many blocks in a day or none for
  weeks depending on your hashrate.

## Web UI dashboard

The web dashboard is accessible on **port 81** from your LAN. It shows:

- Real-time pool and solo hashrate.
- Per-miner hashrate and share count.
- Recent blocks found (pool and solo separately).
- Connected workers.

## Actions

- **Configure Pool** — set payout address, pool fee, and pool identifier.
- **Select Node Backend** — switch between BCHN, BCHD, Flowee, or Knuth.

## Ports

| Port | Protocol | Purpose                  |
|------|----------|--------------------------|
| 3334 | TCP      | Stratum — pool mining    |
| 4568 | TCP      | Stratum — solo mining    |
| 81   | HTTP     | Web UI dashboard         |

## Limitations

- **The BCH node must be fully synced** before the pool can serve valid block
  templates. Miners connect but receive no work until IBD completes.
- Block rewards go to the **Payout Address** configured in Actions. Verify this is a
  BCH address you control before connecting miners.
- Pool share history is not included in backups.

## Support

- Package: <https://github.com/BitcoinCash1/bch-asicseer-startos>
- Upstream: <https://github.com/cculianu/asicseer-pool>
