# TODO

- [ ] Verify the `aarch64` image on real ARM hardware. It is built natively from source and upstream's CMake guards its x86 SIMD paths behind compile checks, so it should build clean, but nothing has run the result yet.
- [ ] The dashboard derives its suggested stratum URLs from the pool's internal ports, which are only the reachable ones when StartOS grants the preferred external port. It cannot ask StartOS for the assigned port; **Connection Info** is authoritative. Consider having `main` write the assigned ports into the stats API so the dashboard can show them.
