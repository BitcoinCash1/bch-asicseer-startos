<p align="center">
  <img src="icon.png" alt="ASICSeer Logo" width="21%">
</p>

# ASICSeer on StartOS

> Everything not listed in this document should behave the same as upstream
> ASICSeer. If a feature, setting, or behavior is not mentioned here, the
> upstream documentation is accurate and fully applicable — see the
> Documentation section of `instructions.md` for links.

[ASICSeer](https://github.com/cculianu/asicseer-pool) is a Bitcoin Cash mining pool: hardware connects to it over stratum, it builds block templates from your own node, and a block it finds is paid out in its own coinbase — split between the miners that worked on it, straight to the addresses they connected with. This package runs the pool and its dashboard against whichever of the four Bitcoin Cash nodes you choose.

- **Upstream repo:** <https://github.com/cculianu/asicseer-pool>
- **Wrapper repo:** <https://github.com/Start9-Community/bch-asicseer-startos>

---

## Table of Contents

- [Image and Container Runtime](#image-and-container-runtime)
- [Volume and Data Layout](#volume-and-data-layout)
- [File Models](#file-models)
- [Dependencies](#dependencies)
- [Network Access and Interfaces](#network-access-and-interfaces)
- [Installation and First-Run Flow](#installation-and-first-run-flow)
- [Actions](#actions)
- [Tasks](#tasks)
- [Health Checks](#health-checks)
- [Backups and Restore](#backups-and-restore)
- [Limitations and Differences](#limitations-and-differences)
- [Upstream Updates](#upstream-updates)
- [Quick Reference for AI Consumers](#quick-reference-for-ai-consumers)

---

## Image and Container Runtime

One image, built here, running twice.

| Property      | Value                                        |
| ------------- | -------------------------------------------- |
| Image         | Built from this repo's `Dockerfile`          |
| Architectures | x86_64, aarch64                              |
| Command       | Two entrypoints: the pool, and the dashboard |

| Subcontainer | Purpose                                       |
| ------------ | --------------------------------------------- |
| `pool-sub`   | The pool itself — attach here for mining logs |
| `ui-sub`     | The dashboard, from the same image            |

Both mount the same volumes; the dashboard reads what the pool writes.

## Volume and Data Layout

One volume, plus a read-only view of the selected node's.

| Volume                 | Mount Point | Purpose                           |
| ---------------------- | ----------- | --------------------------------- |
| `main`                 | `/data`     | The pool's configuration and logs |
| The node's `main` (ro) | `/mnt/node` | The node's own store              |

| Path                 | Written by | Holds                                   |
| -------------------- | ---------- | --------------------------------------- |
| `pool/asicseer.conf` | `main`     | The pool configuration                  |
| `pool/log/`          | The pool   | Share and block history, and the totals |
| `store.json`         | Actions    | Everything the user configures          |

**The node's volume is mounted for its store, not for chain data.** What is read from it is which chain the node is on and — for three of the four nodes — the RPC credentials it published there. Nothing about the blockchain is read from disk.

**The pool's totals live in its log directory**, which is why wiping statistics means clearing that directory rather than a database.

## File Models

Two models.

| File            | Format | Modelled                | Written by         |
| --------------- | ------ | ----------------------- | ------------------ |
| `asicseer.conf` | JSON   | Yes                     | `main`             |
| `store.json`    | JSON   | Yes — `FileHelper.json` | Actions and `main` |

**The pool's own configuration is generated, never edited.** `main` writes it in full at every start from the stored settings plus the node address it resolved, so a hand-edit does not survive.

The store holds the node selection, the payout address, the pool fee, identifier and starting difficulty, the developer-donation switch, the Flowee credential, and two pieces of bookkeeping.

**Two of the store's fields are deliberately outside the reactive read**: the "wipe on next start" flag and the last-seen chain. `main` writes both itself, and including them would make `main` restart itself every time it did.

## Dependencies

Four declared, **exactly one active** — whichever node you select.

| Dependency          | Required         | Health checks required | Why                            |
| ------------------- | ---------------- | ---------------------- | ------------------------------ |
| Bitcoin Cash Node   | Only if selected | `primary`              | Block templates and submission |
| Bitcoin Cash Daemon | Only if selected | `rpc-plaintext`        | The same                       |
| Flowee the Hub      | Only if selected | `primary`              | The same                       |
| Knuth               | Only if selected | `primary`              | The same                       |

**They are gated on being up, not on being synced**, and that is a deliberate trade: a node's initial sync takes days, and refusing to start for that long is less useful than starting and _reporting_ that the chain is behind — which the Node health check does.

**Each node is dialed differently**, and the differences are real rather than cosmetic:

- **Bitcoin Cash Node remaps its RPC port per chain**, so the port to resolve depends on which chain it is on. The other two are fixed.
- **Bitcoin Cash Daemon is dialed through its plaintext proxy** rather than its own TLS RPC, so no certificate has to be trusted here.
- **Flowee keeps only a hash of each RPC password** and cannot hand one back. So this package **mints its own credential** and asks Flowee to register it — see [Tasks](#tasks).

Selecting a node also clears the tasks belonging to the nodes you are not on, so switching away from Flowee does not leave its credential prompt behind.

## Network Access and Interfaces

Two interfaces.

| Interface | Id            | Type | Port | Description                       |
| --------- | ------------- | ---- | ---- | --------------------------------- |
| Pool      | `pool-mining` | p2p  | 3334 | Where mining hardware connects    |
| Dashboard | `web-ui`      | ui   | 81   | Hashrate, shares, workers, blocks |

**The stratum port is raw TCP and advertises itself as such.** Its addresses are shown with a `stratum+tcp://` scheme rather than an HTTP one, because that is what a miner is configured with — the scheme is overridden precisely so the address can be copied straight into hardware.

**Stratum is unencrypted, and that is the protocol, not a choice here.** Mining hardware speaks it in the clear.

**Neither interface is authenticated**, and for the stratum port that is how a pool works: a miner identifies itself by putting **its own** payout address in the username, and the password is ignored. Anyone who can reach the port can mine here and be paid to their own address, paying you the pool fee for the privilege — so exposure is a question of whether you want to run a public pool, not of whether someone can take your money. Anyone who can reach the dashboard sees your mining statistics.

## Installation and First-Run Flow

Install raises **two `critical` tasks**: choose the node, and set the payout address. Neither can be skipped — a pool with no node has no work, and the pool refuses to build a coinbase without a valid fee address.

Selecting **Flowee** raises a third task — on Flowee, not here — asking it to register the credential this package generated. Selecting **Knuth** raises one on Knuth instead, asking it to turn JSON-RPC on and use its full database mode; it is recurring, so turning either back off raises it again.

Once the node is running, the pool writes its configuration, starts, and accepts miners. Point hardware at the stratum address.

**The pool does not refuse to start for a fixable problem.** When there is no payout address, when the address belongs to the wrong chain, or when the node is unreachable, the service comes up with a single failing health check that says which — rather than throwing. That is not politeness: a thrown start-up crash-loops under automatic restart and leaks a mount set on every cycle.

## Actions

Four actions.

### Select Node Backend

Chooses which of the four Bitcoin Cash nodes the pool mines against.

- **What it changes:** the selection, and through it the dependency, the mount, and the RPC address.
- **Cost:** the pool restarts onto the new node.
- **Choosing Flowee raises the credential task on Flowee.** It is raised here rather than from the dependency declaration, which re-runs on every init and would keep asking.
- **Runnable at any status.**

### Configure

The address your **pool fee** is paid to, the size of that fee, the pool identifier written into blocks, the starting difficulty, and whether to disable the developer donation.

**This is not where miners are paid.** Each miner supplies its own Bitcoin Cash address as its stratum username, and the coinbase is split between them; the address configured here collects the fee.

- **What it changes:** the settings, and through them the generated configuration.
- **Cost:** the pool restarts.
- **The payout address is checked against the node's chain by its prefix**, locally. The node is not asked, because Flowee's address validation only understands the legacy format and rejects every modern Cash address as invalid.

### Wipe Mining State

Clears the accumulated share and block statistics.

- **What it changes:** sets a flag; the clearing happens on the next start, before the pool launches.
- **Why then:** the pool reloads its totals from its own status file at start, so clearing them underneath a running pool would achieve nothing.

### Connection Info

Shows what to type into mining hardware — the address, and the username and password convention.

- **Requires the service to be running.**

## Tasks

Up to four, and one of them lands on another package.

| Task                    | Raised on    | Severity   | Raised when                                               | Cleared when           |
| ----------------------- | ------------ | ---------- | --------------------------------------------------------- | ---------------------- |
| Select Node Backend     | This package | `critical` | Install                                                   | The action runs        |
| Configure               | This package | `critical` | Install                                                   | The action runs        |
| Configure (fee address) | This package | `critical` | A start with no payout address, or one on the wrong chain | A valid address is set |
| Register credential     | `flowee`     | `critical` | Flowee is selected                                        | Flowee registers it    |
| Auto-Configure          | `knuth-bch`  | `critical` | Knuth is selected and its JSON-RPC or full mode is off    | Its settings match     |

**The payout task is raised from the start-up path**, with its own replay key, so it re-appears whenever the address goes missing or stops matching the chain — and is cleared explicitly once it does match.

## Health Checks

Three checks.

| Check         | Displayed as    | Method                                    |
| ------------- | --------------- | ----------------------------------------- |
| `pool`        | "Mining"        | The pool's own log, then the stratum port |
| `ui`          | "Web Dashboard" | Port 81 is listening                      |
| `node-status` | "Node"          | The node's store, read from the mount     |

**The mining check reads the log before it probes the port, and that is the important part.** ASICSeer holds the stratum port open even when it cannot get a block template — so a bare port check would report a healthy pool that mines nothing. The check looks for the two failures that produce exactly that: a payout address the node rejected, and a node that is not answering.

**The Node check is how a chain change is noticed.** The node's chain is a file, not a reactive source, so it is re-read here — and it has to be, because a binding a node moves off is left _disabled_ rather than removed, and a disabled binding still resolves. The address read would never go null on its own.

When it sees the chain has moved, it restarts the service. When the node reports it is still syncing, it reports that as loading rather than blocking: **a block found on a stale tip would be orphaned**, which is worth saying and not worth refusing to run over.

## Backups and Restore

The `main` volume is copied wholesale — `sdk.Backups.ofVolumes('main')`. That is the settings, the generated configuration, and the share and block history.

**There are no keys here.** Payouts happen in the coinbase of a found block, to addresses miners supply themselves; this service holds no wallet and custodies nothing. What the backup protects is your configuration and your history.

A restored instance comes back on the same node with the same fee address, re-resolves the node's address, and continues.

## Limitations and Differences

1. **One node at a time**, and switching restarts the pool.
2. **Neither interface is authenticated.** The stratum port accepts any miner; the dashboard shows your statistics to anyone who reaches it.
3. **Stratum is unencrypted** — that is the protocol. Miners are identified by the address in their username and nothing else.
4. **A node is required but not required to be synced.** Blocks found while it is behind would be orphaned, and the Node check says so.
5. **The pool configuration is regenerated at every start**; editing it directly does not survive.
6. **Changing chains wipes the statistics**, because shares counted against one chain's difficulty mean nothing on another.
7. **The payout address is validated by prefix only.** An address with no prefix is not judged.
8. **Flowee needs a credential registered on it** before the pool can log in.

---

## Upstream Updates

`check-upstream.yml` looks for a new ASICSeer release tag daily. When one appears, `scripts/auto-bump.sh` sets `startos/versions/current.ts` to `<upstream>:0`, resets `ALLOW_DOWNGRADE` to `false`, updates `ARG ASICSEER_REF` in the `Dockerfile`, and opens a pull request from `auto-bump/<tag>`. Before merging, check that every patch in `patches/apply.py` still applies to the new source. Nothing reaches `master` until that PR is merged; merging it is what releases the new version. Package-only fixes bump the revision after the colon by hand in their own PR.

## Quick Reference for AI Consumers

```yaml
package_id: bch-asicseer
image: built from ./Dockerfile
architectures:
  - x86_64
  - aarch64
subcontainers:
  - pool-sub # asicseer-pool
  - ui-sub # the dashboard, same image, second entrypoint
volumes:
  main: /data # pool/asicseer.conf, pool/log/, store.json
  # the selected node's main volume is read-only at /mnt/node — for its store, not chain data
file_models:
  - pool/asicseer.conf # generated in full by main at every start
  - store.json # node selection, payout address, fee, identifier, difficulty, flowee creds
startos_managed_env_vars: [] # everything is asicseer.conf
dependencies: # exactly one is declared at a time, from the stored selection
  - bitcoincashd # healthChecks: [primary]; RPC port varies per chain
  - bchd # healthChecks: [rpc-plaintext]; dialed via the plaintext proxy, no cert to trust
  - flowee # healthChecks: [primary]; needs a credential registered via createTask
  - knuth-bch # healthChecks: [primary]; RPC port varies per chain; JSON-RPC + full mode via autoconfig task
interfaces:
  pool-mining: { type: p2p, port: 3334 } # raw TCP, schemeOverride stratum+tcp
  web-ui: { type: ui, port: 81 } # no authentication
actions:
  - select-node
  - configure
  - wipe-mining-state
  - connection-info # only-running
tasks:
  - { action: select-node, severity: critical } # install
  - { action: configure, severity: critical } # install
  - { action: configure, severity: critical, replayId: payout-address } # raised from main
  - { on: flowee, action: create-dependent-credential, severity: critical } # when flowee selected
  - { on: knuth-bch, action: autoconfig, severity: critical, once: false } # when knuth selected
health_checks:
  - pool # displayed "Mining"; scrapes the log before probing the port
  - ui # displayed "Web Dashboard"
  - node-status # displayed "Node"; re-reads the node's chain and restarts on a change
```
