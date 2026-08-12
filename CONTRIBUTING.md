# Contributing

## Keep these in sync

- **[`README.md`](./README.md)** — what this package is and how it is built (image, volumes, interfaces). Technical reference for developers and AI assistants.
- **[`instructions.md`](./instructions.md)** — the user-facing instructions packed into the `.s9pk` and shown on the **Instructions** tab in StartOS, for the person running the service.
- **[`TODO.md`](./TODO.md)** — pending work on this package.

**Read all three before starting any work.** Any code change that affects user-visible behavior must update `README.md` and `instructions.md` in the same change; add to `TODO.md` when you defer work, and remove items when complete. Content rules: [Writing READMEs](https://docs.start9.com/packaging/writing-readmes.html), [Writing Instructions](https://docs.start9.com/packaging/writing-instructions.html).

## Environment setup

See [Environment Setup](https://docs.start9.com/packaging/environment-setup.html)

## Building

```bash
npm ci    # install dependencies
make      # build the universal .s9pk
```

For a complete list of build options, see [Makefile](https://docs.start9.com/packaging/makefile.html).

## Updating the upstream version

1. Apply the upstream bump per [UPDATING.md](./UPDATING.md).
2. Update `version` and `releaseNotes` in the latest `startos/versions/v*.ts` file — see [Versions](https://docs.start9.com/packaging/versions.html).

## CI/CD

Workflows under `.github/workflows/`:

- **`tagAndRelease.yml`** — on push to `master`, tags `v<version>` and publishes a GitHub release with the built `.s9pk`.
- **`check-upstream.yml`** — scheduled daily check for new upstream versions (where present).

## How to contribute

1. Fork the repository and create a branch from `master`.
2. Make your changes — including the doc updates above.
3. Open a pull request to `master`.
