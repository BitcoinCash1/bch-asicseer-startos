# AGENTS.md

This is a StartOS service-package repository — it builds a `.s9pk` for StartOS.

Develop it inside a StartOS packaging workspace created by `start-cli s9pk init-workspace`,
which provides the packaging guide and agent context one level up. If you're reading this in a
bare clone with no workspace, the full guide is at <https://docs.start9.com/packaging>.

**Start every task at the recipe index** — `../start-technologies/projects/start-sdk/docs/src/recipes.md`
(or <https://docs.start9.com/packaging/recipes.html>). It maps an intent ("prompt the user to create
admin credentials", "expose a web UI") to the constructs, the reference pages, and a named production
package to copy. Find the recipe before you read this package's neighbours: a package you reach by
grepping may be non-conformant, and the recipe outranks it.

Freshly scaffolded? Work the
[New Package Checklist](../start-technologies/projects/start-sdk/docs/src/new-package-checklist.md)
(or <https://docs.start9.com/packaging/new-package-checklist.html>) from top to bottom. It is a
guide page, not a file in this repo — read it, don't copy it in.

Keep `README.md` (technical reference for an AI support or administering agent) and
`instructions.md` (end-user docs) in sync with your changes.

**Bugs and feature requests are GitHub issues on this repo** — file them as you find them.
Don't record work in the repo instead: no `TODO.md`, no `NOTES.md`, no `PLAN.md`. What you
verified, tried, and decided belongs in the commit message and the PR body.

## This repo

- **`Dockerfile` builds asicseer-pool from source**, in about a minute. Do not reintroduce the retired arrangement where a separate workflow pushed a prebuilt binary image to GHCR and the `Dockerfile` copied binaries out of it: that image was amd64-only while the manifest claimed aarch64, and it lived in a namespace this repo cannot publish to.
- **`pool_fee` must be written with a decimal point.** asicseer-pool reads it through jansson's `json_is_real`, which is false for a whole number — `"pool_fee": 0` is discarded in favour of the built-in 1% default. `fileModels/asicseer.conf.ts` handles that with a placeholder substitution; don't "simplify" it back to plain `JSON.stringify`.
- **`main` must never throw for a user-fixable problem.** A thrown `main` crash-loops under auto-restart and leaks a mount set every cycle, so the missing/mismatched payout address and unreachable node paths return a single failing `mining` health check instead. Keep that shape.
- **Statistics must be wiped before the daemons launch.** asicseer-pool reloads its totals from `{logdir}/pool/pool.status` at start, so clearing under a running pool achieves nothing. A chain change wipes them too — shares counted at one chain's difficulty mean nothing on another.
- **The payout address is chain-checked locally, by prefix.** Flowee's `validateaddress` is legacy-base58-only and calls every CashAddr invalid, so asking the node is not an option.
- **BCHN remaps its RPC port per chain**; BCHD and Flowee are fixed. BCHD is dialed through its plaintext proxy so no certificate has to be trusted.
- **The node is reached with `sdk.host.getBridgeAddress`, never `<package-id>.startos`** — that overlay DNS is deprecated and forbidden.
- **The `mining` check scrapes the log before probing the port.** asicseer-pool holds the stratum port open while it cannot get a block template, so a bare port check reports a pool that mines nothing.
- **The configured payout address collects the pool fee only.** Miners are paid in the coinbase, to the address each supplies as its stratum username — don't describe it as "where blocks are paid".

## Repository conventions

This repo is the original the Start9-Community copy is imported from. Keep it a
near-replica of that copy: every difference must be one of those listed below.

- **Syncing with Start9-Community:** `git merge` their `master` into ours, never
  rebase or force-push. Take their side for packaging, layout, docs and CI;
  keep only the deliberate differences below.
- **Branches:** `master` is released — every push to it runs Tag and Release.
  Work happens on short-lived branches and reaches `master` through a PR.
  `next` is kept on purpose: Start9's Sync Next workflow mirrors `master` into
  it, so do not delete it.
- **Versions:** `<upstream>:<revision>` in the single `startos/versions/current.ts`.
  Never change the upstream part by hand; a new upstream starts at `:0` (the
  auto-bump PR does this). Bump the revision once per shipped package change —
  not for docs, CI or archive changes. `ALLOW_DOWNGRADE` stays `false` unless a
  release is known to be reversible.
- **`assets/` vs `archive/`:** `assets/` is packed into the s9pk as a whole. Here
  it holds Start9's runtime files (nginx config, entrypoints, the stats API and
  worker scripts) that the service uses; leave them as Start9 has them.
  `archive/` holds reference material (`ABOUT.md`, logos, picture variants) and
  is not packed. Never delete anything in `archive/`.
- **What StartOS shows:** name from `title` in `startos/manifest/index.ts`,
  description and About text from `short`/`long` in `startos/manifest/i18n.ts`,
  Instructions tab from `instructions.md` (required), logo from `icon.png`.
- **Commit and PR hygiene:** no session links, `Co-Authored-By` trailers or
  "Generated with" footers in commit messages, PR descriptions or comments.
  The Session Link Guard workflow fails any PR or push that carries one.
  Commits are authored by the maintainer, and all repository text (code
  comments, docs, commit messages, PR text) is written in the maintainer's
  voice, without naming the tools used to produce it.
- **Toolchain:** always follow the latest Start9 tooling — the newest
  `@start9labs/start-sdk` on npm (pinned exactly, with the `overrides` entry),
  the newest `start-cli` release, and the latest `Start9Labs/hello-world-startos`
  template. Its boilerplate files (workflows, `Makefile`, `tsconfig.json`,
  `.gitignore`, `.dockerignore`, `CLAUDE.md`, `startos/index.ts`,
  `startos/sdk.ts`, `startos/i18n/index.ts`, `startos/versions/index.ts`) stay
  byte-identical to it unless a difference is listed below. When the template,
  SDK or CLI moves, update every package. Where the template and the
  Start9-Community copy disagree, the template wins.
- **Deliberate differences from Start9-Community:** Knuth (`knuth-bch`) as a fourth node backend (utils, dependencies with a recurring autoconfig task, selectNode, manifest, i18n); `ALLOW_DOWNGRADE` in `current.ts`; `check-upstream.yml` + `scripts/auto-bump.sh` (daily upstream tag check, opens a bump PR); `dependabot.yml`; `session-link-guard.yml`; `scripts/setup-vm-forwarding*` (LAN port forwarding for StartOS in a libvirt/KVM VM); `startos/index.ts` and `startos/sdk.ts` synced to the hello-world template; `archive/` (including the old `icon.png`); the matching README/instructions notes.
