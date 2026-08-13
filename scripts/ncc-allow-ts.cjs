#!/usr/bin/env node
/**
 * ncc's bundled ts-loader refuses to compile .ts imported from node_modules.
 * Our node packages ship TypeScript only (autoconfig actions), so the bundle
 * cannot be produced unless that guard is lifted.
 */
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const loader = path.join(
  __dirname,
  '..',
  'node_modules',
  '@vercel',
  'ncc',
  'dist',
  'ncc',
  'loaders',
  'ts-loader.js.cache.js',
)

if (fs.existsSync(loader)) {
  let src = fs.readFileSync(loader, 'utf8')
  const before = src
  src = src.replace(
    /!ae\.loaderOptions\.allowTsInNodeModules&&N\.indexOf\("node_modules"\)!==-1/g,
    'false',
  )
  src = src.replace(
    /allowTsInNodeModules:false/g,
    'allowTsInNodeModules:true',
  )
  if (src !== before) {
    fs.writeFileSync(loader, src)
  }
}

const ncc = path.join(__dirname, '..', 'node_modules', '.bin', 'ncc')
const r = spawnSync(ncc, ['build', 'startos/index.ts', '-o', './javascript'], {
  stdio: 'inherit',
})
process.exit(r.status === null ? 1 : r.status)
