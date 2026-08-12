'use strict'
// Tiny HTTP server: handles POST /api/delete-worker?address=<addr>
// Writes a tombstone so stats-api.sh suppresses the worker even after the pool
// daemon recreates the user file from its in-memory state.
// Listens on 127.0.0.1:8181 only; nginx proxies /api/delete-worker to it.
var http = require('http')
var fs   = require('fs')
var path = require('path')
var url  = require('url')

// Accept cashaddr (bitcoincash:q/p...) and legacy base58 (1.../3...) addresses.
// Also allow bare cashaddr without the "bitcoincash:" prefix (some pools strip it).
var SAFE_ADDR = /^(bitcoincash:[pq][a-z0-9]{41,50}|[pq][a-z0-9]{41,50}|[13][a-zA-Z0-9]{25,34})$/i

http.createServer(function (req, res) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method !== 'POST') {
    res.writeHead(405)
    res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }))
    return
  }

  var parsed = url.parse(req.url, true)
  if (parsed.pathname !== '/api/delete-worker') {
    res.writeHead(404)
    res.end(JSON.stringify({ ok: false, error: 'Not found' }))
    return
  }

  var address = String(parsed.query.address || '').trim()

  if (!SAFE_ADDR.test(address)) {
    res.writeHead(400)
    res.end(JSON.stringify({ ok: false, error: 'Invalid address format' }))
    return
  }

  // path.basename strips any directory traversal attempts
  var safeAddr  = path.basename(address)
  var filePath  = '/data/pool/log/users/' + safeAddr
  var tombPath  = '/data/pool/log/users/.tomb.' + safeAddr
  var nowSec    = Math.floor(Date.now() / 1000)

  // Write tombstone first — stats-api.sh checks this to suppress the worker
  // even after the pool daemon rewrites the user file from its in-memory state.
  // The tombstone is cleared automatically when lastshare advances past it.
  fs.writeFile(tombPath, String(nowSec), function (tombErr) {
    if (tombErr) {
      res.writeHead(500)
      res.end(JSON.stringify({ ok: false, error: 'Could not write tombstone: ' + tombErr.message }))
      return
    }
    // Also delete the user file (best-effort; daemon may recreate it)
    fs.unlink(filePath, function (unlinkErr) {
      if (unlinkErr && unlinkErr.code !== 'ENOENT') {
        res.writeHead(500)
        res.end(JSON.stringify({ ok: false, error: unlinkErr.message }))
        return
      }
      res.writeHead(200)
      res.end(JSON.stringify({ ok: true, address: address }))
    })
  })
}).listen(8181, '127.0.0.1')
