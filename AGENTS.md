# AGENTS.md

This is a StartOS service-package repository — it builds a `.s9pk` for StartOS.

Develop it inside a StartOS packaging workspace created by `start-cli s9pk init-workspace`,
which provides the packaging guide and agent context one level up. If you're reading this in a
bare clone with no workspace, the full guide is at <https://docs.start9.com/packaging>.

Work this package's `TODO.md` from top to bottom. Keep `README.md` (architecture, for developers and LLMs) and `instructions.md` (end-user docs) in sync with your changes.

## This repo

- **Package id is `bch-asicseer`.** Runs [asicseer-pool](https://github.com/cculianu/asicseer-pool) as a shared pool and a solo pool at once, against one of three Bitcoin Cash node packages, plus a static web dashboard served by nginx. One image, one `main` volume, three daemons.
- **`patches/apply.py` is load-bearing, and it fails loudly on purpose.** Upstream targets Bitcoin Cash Node; each patch fixes something that is otherwise silently broken against BCHD or Flowee. Every replacement asserts its expected hit count, so an upstream bump that moves a line fails the image build. Reanchor the patch — never loosen the assertion, and never make one optional.
- **`Dockerfile` builds asicseer-pool from source.** It takes about a minute. Do not reintroduce the retired arrangement where a separate workflow pushed a prebuilt binary image to GHCR and the `Dockerfile` copied binaries out of it: that image was amd64-only while the manifest claimed aarch64, and it lived in a namespace this repo cannot publish to.
- **The node is reached with `sdk.host.getBridgeAddress`, never `<package-id>.startos`.** That overlay DNS is deprecated and forbidden; see the packaging guide's Service-to-Service Networking page.
- **Flowee publishes no RPC password.** It stores only a hash, so `seedFiles` mints a credential and `selectNode` raises a task on Flowee to register it. Bitcoin Cash Node and Bitcoin Cash Daemon publish theirs in their own `store.json`, which `main` reads off the read-only mount at `/mnt/node`.
- **`pool_fee` must be written with a decimal point.** The pool reads it through jansson's `json_is_real`, which is false for a whole number — `"pool_fee": 0` is discarded in favour of the built-in 1% default. `fileModels/asicseer.conf.ts` handles this; don't "simplify" it back to plain `JSON.stringify`.

## Inspecting a running install

To run a command inside one of the service's containers, use `start-cli package attach bch-asicseer -n pool-sub -- <cmd>` (or `-n solo-sub` / `-n ui-sub`). Select the subcontainer by **name** with `-n` (the name passed to `SubContainer.of` in `main.ts`) or by image with `-i`. Note: `-s/--subcontainer` matches the internal **Guid**, not the name, so passing a name to `-s` fails with "no matching subcontainers".
