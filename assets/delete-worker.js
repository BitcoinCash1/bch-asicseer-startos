'use strict'
// Tiny HTTP server: handles POST /api/delete-worker?address=<addr>&mode=pool|solo
// Deletes the per-user stats file so the worker disappears from the dashboard.
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
  var mode    = String(parsed.query.mode    || '').trim()

  if (mode !== 'pool' && mode !== 'solo') {
    res.writeHead(400)
    res.end(JSON.stringify({ ok: false, error: 'Invalid mode' }))
    return
  }

  if (!SAFE_ADDR.test(address)) {
    res.writeHead(400)
    res.end(JSON.stringify({ ok: false, error: 'Invalid address format' }))
    return
  }

  // path.basename strips any directory traversal attempts
  var safeAddr = path.basename(address)
  var filePath = '/data/' + mode + '/log/users/' + safeAddr

  fs.unlink(filePath, function (err) {
    if (err && err.code === 'ENOENT') {
      res.writeHead(404)
      res.end(JSON.stringify({ ok: false, error: 'Worker not found' }))
      return
    }
    if (err) {
      res.writeHead(500)
      res.end(JSON.stringify({ ok: false, error: err.message }))
      return
    }
    res.writeHead(200)
    res.end(JSON.stringify({ ok: true, address: address, mode: mode }))
  })
}).listen(8181, '127.0.0.1')
