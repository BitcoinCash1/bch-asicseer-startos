<p align="center">
  <img src="icon.svg" alt="ASICSeer Logo" width="21%">
</p>

# ASICSeer on StartOS

> **Upstream docs:** <https://github.com/cculianu/asicseer-pool>
>
> Everything not listed in this document should behave the same as upstream
> asicseer-pool. If a feature, setting, or behavior is not mentioned here, the
> upstream documentation is accurate and fully applicable.

[asicseer-pool](https://github.com/cculianu/asicseer-pool) is a Bitcoin Cash mining pool server, a fork of ckpool. This package runs it against a Bitcoin Cash full node installed on the same StartOS server, and adds a web dashboard for monitoring it.

---

## Table of Contents

- [Image and Container Runtime](#image-and-container-runtime)
- [Volume and Data Layout](#volume-and-data-layout)
- [Installation and First-Run Flow](#installation-and-first-run-flow)
- [Configuration Management](#configuration-management)
- [Network Access and Interfaces](#network-access-and-interfaces)
- [Actions (StartOS UI)](#actions-startos-ui)
- [Backups and Restore](#backups-and-restore)
- [Health Checks](#health-checks)
- [Dependencies](#dependencies)
- [Limitations and Differences](#limitations-and-differences)
- [What Is Unchanged from Upstream](#what-is-unchanged-from-upstream)
- [Contributing](#contributing)
- [Quick Reference for AI Consumers](#quick-reference-for-ai-consumers)

---

## Image and Container Runtime

One image, `asicseer`, built from the package `Dockerfile`. There is no upstream image: the first stage clones `cculianu/asicseer-pool` at the tag pinned in `ASICSEER_REF` and builds it with CMake; the runtime stage is `node:20-bookworm-slim` with nginx, curl and jq added.

Architectures: `x86_64` and `aarch64`, each built natively.

`patches/apply.py` runs against the upstream source before it is compiled. Upstream targets Bitcoin Cash Node, and each patch fixes something that is otherwise silently broken against one of the other two nodes — a JSON-RPC request with no `id` member (rejected by BCHD), HTTP headers arriving in an order the pool's reader does not expect (BCHD again), and `validateaddress` responses from a node with no wallet or with legacy-only address parsing (BCHD and Flowee). Every patch asserts its expected hit count, so an upstream bump that moves one of these lines fails the image build rather than producing a pool that cannot mine.

Two daemons share the one image:

| Daemon | Subcontainer | Command                          | Purpose              |
| ------ | ------------ | -------------------------------- | -------------------- |
| `pool` | `pool-sub`   | `pool-entrypoint.sh <conf>`      | Stratum pool server  |
| `ui`   | `ui-sub`     | `ui-entrypoint.sh`               | nginx + stats writer |

`pool-entrypoint.sh` wraps the pool binary rather than replacing it: it restarts the daemon if it exits abnormally, pre-creates the sharelog directory for the next few block heights (upstream only creates it when it sees a new block, so shares submitted in between are dropped from the only per-worker record that is persisted), and stages the live client table to the shared volume so the dashboard can derive a per-worker submission count.

## Volume and Data Layout

One volume, `main`, mounted at `/data` in both subcontainers.

| Path                         | Contents                                                        |
| ---------------------------- | --------------------------------------------------------------- |
| `/data/store.json`           | StartOS-side settings — node choice, payout address, pool params |
| `/data/pool/asicseer.conf`   | Generated pool config, rewritten on every start                 |
| `/data/pool/log/`            | Pool status, sharelogs, per-user files — the mining statistics   |

The selected node's own `main` volume is mounted read-only at `/mnt/node`. Nothing reads chain data from it; it is there so `main` can read the node's `store.json` for the chain it is on and, on Bitcoin Cash Node and Bitcoin Cash Daemon, its RPC credentials.

## Installation and First-Run Flow

Two critical tasks are raised on install: **Select Node Backend** and **Configure**. The pool cannot mine without both — an unset payout address means a found block would pay nowhere.

`main` refuses to start the mining daemon and reports a single failing **Mining** health check when the payout address is missing, belongs to a different chain than the node is on, or the node's RPC is not reachable. It does not throw: a thrown `setupMain` crash-loops the service under auto-restart and leaks a subcontainer mount set on every cycle.

Choosing Flowee the Hub additionally raises a task on Flowee. Flowee stores only a hash of each RPC password and cannot hand one back, so this package mints a credential on first init and registers it there through Flowee's own `create-dependent-credential` action.

## Configuration Management

| StartOS-Managed                                                               | Upstream-Managed                          |
| ----------------------------------------------------------------------------- | ----------------------------------------- |
| `asicseer.conf` in full — RPC target and credentials, payout address, pool signature, stratum port, log directory, fee, starting difficulty | Nothing — the config file is regenerated on every start and hand edits are lost |

The settings a user can change are the five inputs of the **Configure** action plus the node choice in **Select Node Backend**. Everything else in the generated config is fixed at upstream's defaults.

`pool_fee` is written with a decimal point even when whole. The pool reads it through jansson's `json_is_real`, which is false for an integer, so `"pool_fee": 0` would be discarded in favour of the built-in 1% default — a pool configured to take nothing would take one percent.

## Network Access and Interfaces

| Interface     | Id            | Internal port | Protocol | Type  | Purpose           |
| ------------- | ------------- | ------------- | -------- | ----- | ----------------- |
| Pool Mining   | `pool-mining` | 3334          | raw TCP  | `p2p` | Stratum endpoint  |
| Web Dashboard | `web-ui`      | 81            | HTTP     | `ui`  | Mining statistics |

The stratum interface carries a `schemeOverride` of `stratum+tcp`, so the addresses StartOS shows are in the form a miner accepts. Stratum is unencrypted — mining hardware does not speak TLS — so it binds with `secure: { ssl: false }`.

Where each interface is reachable is the user's choice, made in StartOS.

## Actions (StartOS UI)

| Name                | Id                  | Visibility | Availability | Inputs                                                                        | Outputs                    |
| ------------------- | ------------------- | ---------- | ------------ | ----------------------------------------------------------------------------- | -------------------------- |
| Connection Info     | `connection-info`   | enabled    | only running | none                                                                          | Stratum URL, username and password format |
| Configure           | `configure`         | enabled    | any          | Payout address, pool fee, pool identifier, starting difficulty, dev-donation toggle | none                       |
| Select Node Backend | `select-node`       | enabled    | any          | Node package                                                                  | none                       |
| Wipe Mining State   | `wipe-mining-state` | enabled    | any          | none                                                                          | none                       |

**Configure** and **Select Node Backend** write `store.json`, which `main` reads through a mapped `.const()` — the write is what restarts the pool onto the new settings.

**Wipe Mining State** sets a flag and restarts. The deletion happens in `main` before the daemons launch, because the pool reloads its accumulated totals from `{logdir}/pool/pool.status` on every start; deleting them while it is running would simply write them back. `main` performs the same wipe unprompted when the node's chain has changed since the last start, since shares counted against one chain's difficulty mean nothing on another.

## Backups and Restore

The `main` volume in full, which is the settings and the mining statistics. Restoring returns the pool to the settings and statistics of the backup; connected miners reconnect on their own.

## Health Checks

| Check         | Display       | What it reports                                                                                    |
| ------------- | ------------- | -------------------------------------------------------------------------------------------------- |
| `pool` daemon | Mining        | The last lines of the pool's log first — a rejected payout address or an unreachable node fail here — then that the stratum port is listening |
| `ui` daemon   | Web Dashboard | Port 81 listening                                                                                  |
| `node-status` | Node          | Re-reads the node's `store.json`: restarts the service if the node changed chain, fails if it is unreadable, loads while the node is still syncing |
| `mining`      | Mining        | Replaces all of the above when the pool cannot run at all — no payout address, wrong-chain address, or no reachable node |

The log check exists because the pool holds the stratum port open while unable to build work, so a bare port check reports a healthy pool that mines nothing.

`node-status` is where a chain change is noticed, for every node. Bitcoin Cash Node does move its RPC port with the chain, but the binding it moves off is left *disabled* rather than removed, and a disabled binding still resolves to its old address — so the bridge address `main` watches does not go null and would not re-run `main` on its own.

## Dependencies

Exactly one node is needed at a time — whichever **Select Node Backend** has chosen — so all three are declared optional.

| Dependency          | Package id     | Health check     | Mounted             | Purpose                                    |
| ------------------- | -------------- | ---------------- | ------------------- | ------------------------------------------ |
| Bitcoin Cash Node   | `bitcoincashd` | `primary`        | `main` → `/mnt/node` (ro) | Block templates over JSON-RPC        |
| Bitcoin Cash Daemon | `bchd`         | `rpc-plaintext`  | `main` → `/mnt/node` (ro) | The same, dialed through BCHD's plaintext proxy so no certificate has to be trusted |
| Flowee the Hub      | `flowee`       | `primary`        | `main` → `/mnt/node` (ro) | The same, with a credential this package registers on it |

The dependency is gated on the node being up, not on it being synced — a pool that refused to start until a fresh chain had synced would be unusable for days. Sync state is reported by the `node-status` health check instead.

No autoconfig task is raised on Bitcoin Cash Node or Bitcoin Cash Daemon. The pool calls only `getblocktemplate`, `submitblock`, `validateaddress`, `getrawtransaction` and the chain-info reads, none of which need a transaction index or an unpruned chain.

## Limitations and Differences

1. **There is no solo-mining mode.** upstream asicseer-pool has none — no `-B`/`btcsolo` flag, and the word does not appear in its source. It always pays every block's miners directly and proportionally in the coinbase. An earlier revision of this package ran a second daemon labelled "Solo Mining"; it was a second copy of the same proportional pool with a zero fee, and it has been removed. EloPool, whose upstream is Con Kolivas' ckpool, does have real solo mining.
2. **Knuth is not supported.** It serves mining templates through `getblocktemplatelight` / `submitblocklight`; this pool speaks classic `getblocktemplate` only.
3. **The config file is regenerated on every start.** Any hand edit to `/data/pool/asicseer.conf` is overwritten.
4. **Only a subset of upstream's configuration is exposed.** `mindiff_overrides`, multiple `serverurl` entries, `bchsig` rotation, ZMQ block notification and node/proxy/redirector modes are all left at upstream defaults and are not settable.
5. **The node must be on the same StartOS server.** There is no option to point the pool at a remote node.
6. **The dashboard's suggested stratum URL uses the pool's internal port.** Use the **Connection Info** action for the address StartOS actually assigned.

## What Is Unchanged from Upstream

- The stratum v1 protocol, vardiff behavior, and share accounting.
- Coinbase payout: each block is split between the miners that worked on it, paid to the addresses they connected with, minus the pool fee and the developer donation.
- The username-as-payout-address convention, including the `address.workername` suffix.
- The developer donation, which is a tenth of the pool fee and is on unless disabled.
- The on-disk log layout the pool writes: `pool.status`, the per-user files, and the per-height sharelog directories.

## Contributing

See [AGENTS.md](./AGENTS.md).

---

## Quick Reference for AI Consumers

```yaml
package_id: bch-asicseer
architectures: [x86_64, aarch64]
volumes:
  main: /data
mounted_dependency_volumes:
  '<selected node>:main': /mnt/node (read-only)
ports:
  pool-mining: 3334
  web-ui: 81
dependencies: [bitcoincashd, bchd, flowee] # all optional; exactly one selected
startos_managed_env_vars: []
startos_managed_files:
  - /data/pool/asicseer.conf
  - /data/store.json
actions:
  - connection-info
  - configure
  - select-node
  - wipe-mining-state
health_checks:
  - pool
  - ui
  - node-status
```
