# Updating the upstream version

This package builds [asicseer-pool](https://github.com/cculianu/asicseer-pool) from source in its own `Dockerfile`.

## Determining the upstream version

```sh
gh release view -R cculianu/asicseer-pool --json tagName -q .tagName
```

The current pin is the `ASICSEER_REF` build argument in `Dockerfile`.

## Applying the bump

1. Set `ASICSEER_REF` in `Dockerfile` to the new tag.
2. Build the image (`make x86`). `patches/apply.py` asserts the expected hit count of every patch it applies, so a line that moved upstream fails the build with the patch that needs reanchoring named. Reanchor it against the new source rather than loosening the assertion — each patch is what makes the pool work against one of the three supported nodes, and a silently skipped one produces a pool that starts and mines nothing.
3. Bump `version` and rewrite `releaseNotes` in `startos/versions/current.ts`.
