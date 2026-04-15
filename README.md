<p align="center">
  <img src="icon.svg" alt="ASICSeer Logo" width="21%">
</p>

# ASICSeer for StartOS

<p align="center">
  <img src="https://img.shields.io/badge/platform-StartOS-brightgreen" alt="StartOS">
  <img src="https://img.shields.io/badge/architecture-x86__64%20%7C%20aarch64-blue" alt="Architecture">
  <img src="https://img.shields.io/badge/license-GPL--3.0-orange" alt="License">
</p>

**ASICSeer** is a Bitcoin Cash mining pool for [StartOS](https://start9.com), powered by [ASICSeer Pool](https://github.com/cculianu/asicseer-pool) — fast, C-based, multithreaded mining pool software for Bitcoin Cash. It provides **dual-mode** operation — pool mining and solo mining — with a built-in web dashboard.

## Features

- **Pool Mining** (port 3334) — Shared block rewards among all miners
- **Solo Mining** (port 4568) — Winner takes the entire block reward
- **Web Dashboard** (port 81) — Real-time hashrate, workers, blocks found
- **Stratum Protocol** — Compatible with all ASIC miners (Antminer, Whatsminer, Bitaxe, etc.)
- **Auto-configured** — Automatically connects to your Bitcoin Cash Node (BCHN or BCHD)
- **Multi-architecture** — Runs on x86_64 and aarch64

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  ASICSeer Package                     │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  Pool daemon  │  │  Solo daemon  │  │  Web UI    │ │
│  │  :3334       │  │  :4568       │  │  :81       │ │
│  │  (shared)    │  │  (solo)      │  │  (nginx)   │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘ │
│         │                 │                │         │
│         └────────┬────────┘                │         │
│                  │                         │         │
│         ┌───────▼────────┐     ┌──────────▼───────┐ │
│         │  /data volume  │     │  stats-api.sh    │ │
│         │  (asicseer)    │◄────│  (ckpmsg → JSON) │ │
│         └───────┬────────┘     └──────────────────┘ │
│                 │                                    │
└─────────────────┼────────────────────────────────────┘
                  │ RPC (8332)
         ┌────────▼────────┐
         │  Bitcoin Cash   │
         │  Node (BCHN     │
         │  or BCHD)       │
         └─────────────────┘
```

## Dependencies

| Package | Required | Notes |
|---------|----------|-------|
| **Bitcoin Cash Node** | Yes | BCHN or BCHD flavor. Must be fully synced with txindex enabled. |

## Quick Start

1. **Install Bitcoin Cash Node** on your StartOS server and wait for full sync
2. **Install ASICSeer** from the marketplace
3. **Configure** — Set your BCH payout address via Actions → Configure
4. **Point your miners** at:
   - Pool mode: `stratum+tcp://<your-server>:3334`
   - Solo mode: `stratum+tcp://<your-server>:4568`
5. **Monitor** via the Web Dashboard

### Miner Configuration

| Setting | Value |
|---------|-------|
| **URL** | `stratum+tcp://<host>:3334` (pool) or `:4568` (solo) |
| **Username** | Your BCH address |
| **Password** | Anything (or `d=DIFFICULTY` for custom difficulty) |

## Building from Source

```bash
# Prerequisites: StartOS SDK, Docker, Node.js 20+
git clone https://github.com/BitcoinCash1/bch-asicseer-startos.git
cd bch-asicseer-startos
npm install
make
```

## Port Allocation

| Port | Protocol | Purpose |
|------|----------|---------|
| 3334 | Stratum (TCP) | Pool mining |
| 4568 | Stratum (TCP) | Solo mining |
| 81 | HTTP | Web dashboard |

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| Payout Address | *(required)* | BCH address for coinbase rewards |
| Pool Fee | 1% | Fee percentage for pool mode (solo is always 0%) |
| Pool Identifier | `ASICSeer` | Coinbase signature visible on block explorers |
| Starting Difficulty | 64 | Initial share difficulty for new workers |

## How It Works

ASICSeer runs two independent mining daemon instances from the same Docker image:
- **Pool instance** shares rewards proportionally based on submitted shares
- **Solo instance** directs the entire block reward to whichever miner finds it

Both instances connect to your Bitcoin Cash Node via RPC. The web dashboard uses `ckpmsg` to query ASICSeer's Unix domain sockets and serves stats as static JSON via nginx.

You can point different miners to different modes simultaneously — no reconfiguration needed.

## EloPool vs ASICSeer

Both packages are ckpool forks with the same dual-mode architecture. They use **different ports** so you can run both simultaneously:

| Feature | EloPool | ASICSeer |
|---------|---------|----------|
| Pool Port | 3333 | 3334 |
| Solo Port | 4567 | 4568 |
| Web UI Port | 80 | 81 |
| Upstream | [skaisser/ckpool](https://github.com/skaisser/ckpool) | [cculianu/asicseer-pool](https://github.com/cculianu/asicseer-pool) |

## Upstream

- [cculianu/asicseer-pool](https://github.com/cculianu/asicseer-pool) — Fast, C-based, multithreaded mining pool software for Bitcoin Cash
- [bitcoin-cash-node](https://github.com/bitcoin-cash-node/bitcoin-cash-node) — Bitcoin Cash full node

## License

GPL-3.0 — matches upstream ASICSeer Pool license.

---

<details>
<summary><strong>AI Reference Prompt</strong></summary>

```yaml
package: bch-asicseer
type: startos-service
sdk: "@start9labs/start-sdk@1.0.0"
upstream: cculianu/asicseer-pool
depends_on: bitcoin-cash-node (BCHN or BCHD)
ports:
  pool: 3334 (stratum)
  solo: 4568 (stratum)
  ui: 81 (http)
daemons: 3 (pool-asicseer, solo-asicseer, ui-nginx)
volumes: main (/data)
dependency_mount: /mnt/bitcoin-cash-node (reads store.json for RPC creds)
critical_tasks: txindex=true, prune=null, zmqEnabled=true
config_fields: payoutAddress, poolFee, poolIdentifier, poolDifficulty
webui: nginx serving static HTML + stats-api.sh background (ckpmsg → JSON)
build: multi-stage Docker (ubuntu build-asicseer → node:20-bookworm-slim runtime)
```

</details>
