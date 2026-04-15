// ASICSeer Dashboard — fetches pool + blockchain stats every 5 seconds
;(function () {
  'use strict'

  var REFRESH_MS = 5000

  function formatHashrate(hps) {
    if (hps == null || isNaN(hps)) return '—'
    var n = Number(hps)
    if (n >= 1e18) return (n / 1e18).toFixed(2) + ' EH/s'
    if (n >= 1e15) return (n / 1e15).toFixed(2) + ' PH/s'
    if (n >= 1e12) return (n / 1e12).toFixed(2) + ' TH/s'
    if (n >= 1e9) return (n / 1e9).toFixed(2) + ' GH/s'
    if (n >= 1e6) return (n / 1e6).toFixed(2) + ' MH/s'
    if (n >= 1e3) return (n / 1e3).toFixed(2) + ' KH/s'
    return n.toFixed(0) + ' H/s'
  }

  // dsps (diff-shares-per-second) to H/s: multiply by 2^32
  function dspsToHashrate(dsps) {
    if (dsps == null || isNaN(dsps) || dsps <= 0) return null
    return Number(dsps) * 4294967296
  }

  function formatNumber(n) {
    if (n == null || isNaN(n)) return '—'
    return Number(n).toLocaleString()
  }

  function formatBytes(bytes) {
    if (bytes == null || isNaN(bytes)) return '—'
    var n = Number(bytes)
    if (n >= 1073741824) return (n / 1073741824).toFixed(1) + ' GiB'
    if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MiB'
    if (n >= 1024) return (n / 1024).toFixed(1) + ' KiB'
    return n + ' B'
  }

  function formatDifficulty(d) {
    if (d == null || isNaN(d)) return '—'
    var n = Number(d)
    if (n >= 1e12) return (n / 1e12).toFixed(1) + 'T'
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'G'
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
    return n.toFixed(1)
  }

  function formatEta(seconds) {
    if (seconds == null || isNaN(seconds) || seconds <= 0) return '—'
    var s = Number(seconds)
    var days = Math.floor(s / 86400)
    var hours = Math.floor((s % 86400) / 3600)
    if (days > 365) return Math.floor(days / 365) + 'y ' + (days % 365) + 'd'
    if (days > 0) return days + 'd ' + hours + 'h'
    var mins = Math.floor((s % 3600) / 60)
    if (hours > 0) return hours + 'h ' + mins + 'm'
    return mins + 'm'
  }

  function timeAgo(unixSec) {
    if (!unixSec || unixSec <= 0) return '—'
    var diff = Math.floor(Date.now() / 1000) - unixSec
    if (diff < 0) diff = 0
    if (diff < 60) return diff + 's ago'
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago'
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago'
    return Math.floor(diff / 86400) + 'd ago'
  }

  function el(id) { return document.getElementById(id) }

  function updateCard(prefix, data) {
    var stats = (data && data.stats) || {}
    var users = (data && data.users) || {}

    el(prefix + '-hashrate').textContent = formatHashrate(
      stats.hashrate5m || stats.hashrate1m || stats.hashrate
    )
    el(prefix + '-workers').textContent = formatNumber(
      users.connectedclients || stats.workers || stats.users || 0
    )
    el(prefix + '-blocks').textContent = formatNumber(
      stats.SolvedBlocks || stats.accepted || 0
    )
    el(prefix + '-bestshare').textContent = formatNumber(
      stats.bestshare || stats.best_share || 0
    )
  }

  function updateBlockchain(data) {
    if (!data) return

    var bc = data.blockchain || {}
    var mining = data.mining || {}
    var net = data.network || {}
    var mem = data.mempool || {}

    var progress = bc.verificationprogress
    if (progress != null) {
      var pct = Math.min(progress * 100, 100)
      el('sync-pct').textContent = pct.toFixed(pct >= 99.9 ? 1 : 0) + '%'
      el('ring-label').textContent = pct.toFixed(0) + '%'

      var offset = 314 - (314 * pct / 100)
      var ring = el('ring-progress')
      if (ring) ring.style.strokeDashoffset = offset
    }

    var subver = net.subversion || ''
    var chain = bc.chain || 'main'
    el('sync-sub').textContent = chain + ' | ' + subver

    el('node-blocks').textContent = formatNumber(bc.blocks)
    el('node-headers').textContent = formatNumber(bc.headers)

    if (bc.blocks != null && bc.headers != null) {
      var lag = bc.blocks - bc.headers
      el('node-lag').textContent = (lag >= 0 ? '+' : '') + lag + ' / ' +
        (lag <= 0 ? '+' : '') + (-lag)
    }

    el('node-peers').textContent = formatNumber(net.connections)
    el('node-mempool').textContent = formatBytes(mem.bytes)
    el('node-disk').textContent = formatBytes(bc.size_on_disk)

    var diff = mining.difficulty || bc.difficulty
    el('net-difficulty').textContent = formatDifficulty(diff)
    el('net-hashrate').textContent = formatHashrate(mining.networkhashps)
  }

  function updateEta(poolData, soloData, nodeData) {
    var mining = (nodeData && nodeData.mining) || {}
    var diff = mining.difficulty

    var poolHr = 0
    var soloHr = 0
    if (poolData && poolData.stats) {
      poolHr = Number(poolData.stats.hashrate5m || poolData.stats.hashrate1m || 0)
    }
    if (soloData && soloData.stats) {
      soloHr = Number(soloData.stats.hashrate5m || soloData.stats.hashrate1m || 0)
    }
    var totalHr = poolHr + soloHr

    if (diff && totalHr > 0) {
      var etaSec = (diff * 4294967296) / totalHr
      el('eta-block').textContent = formatEta(etaSec)
    } else {
      el('eta-block').textContent = totalHr > 0 ? '—' : 'No miners connected'
    }
  }

  // Build a combined worker list from pool + solo data
  function updateWorkers(poolData, soloData) {
    var allWorkers = []

    // Workers from pool mode
    var pw = (poolData && poolData.workers) || {}
    var poolList = pw.workers || []
    for (var i = 0; i < poolList.length; i++) {
      poolList[i]._mode = 'pool'
      allWorkers.push(poolList[i])
    }

    // Workers from solo mode
    var sw = (soloData && soloData.workers) || {}
    var soloList = sw.workers || []
    for (var j = 0; j < soloList.length; j++) {
      soloList[j]._mode = 'solo'
      allWorkers.push(soloList[j])
    }

    var tbody = el('workers-tbody')
    var empty = el('workers-empty')
    var wrap = el('workers-table-wrap')
    var badge = el('worker-count-badge')

    badge.textContent = allWorkers.length + ' connected'

    if (allWorkers.length === 0) {
      empty.style.display = ''
      wrap.style.display = 'none'
      return
    }

    empty.style.display = 'none'
    wrap.style.display = ''

    // Sort: active first, then by hashrate descending
    allWorkers.sort(function (a, b) {
      if (a.idle !== b.idle) return a.idle ? 1 : -1
      var hrA = dspsToHashrate(a.dsps5) || 0
      var hrB = dspsToHashrate(b.dsps5) || 0
      return hrB - hrA
    })

    var html = ''
    for (var k = 0; k < allWorkers.length; k++) {
      var w = allWorkers[k]
      var name = w.worker || w.user || '—'
      // Strip the address prefix if worker name contains "." separator
      var shortName = name
      var dotIdx = name.indexOf('.')
      if (dotIdx > 0) shortName = name.substring(dotIdx + 1)

      var hr5m = formatHashrate(dspsToHashrate(w.dsps5))
      var hr60 = formatHashrate(dspsToHashrate(w.dsps60))
      var bestDiff = formatDifficulty(w.bestdiff)
      var lastShare = timeAgo(w.lastshare)
      var alive = !w.idle
      var modeClass = w._mode

      html += '<tr>'
      html += '<td><span class="worker-name">' + escapeHtml(shortName) + '</span>'
      html += '<span class="worker-mode ' + modeClass + '">' + w._mode + '</span></td>'
      html += '<td>' + hr5m + '</td>'
      html += '<td>' + hr60 + '</td>'
      html += '<td>' + bestDiff + '</td>'
      html += '<td>' + lastShare + '</td>'
      html += '<td><span class="status-dot ' + (alive ? 'alive' : 'dead') + '"></span>'
      html += (alive ? 'Active' : 'Idle') + '</td>'
      html += '</tr>'
    }

    tbody.innerHTML = html
  }

  function escapeHtml(s) {
    var d = document.createElement('div')
    d.appendChild(document.createTextNode(s))
    return d.innerHTML
  }

  function fetchStats(url) {
    return fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error(res.status)
        return res.json()
      })
      .catch(function () {
        return null
      })
  }

  function tick() {
    var badge = el('status-badge')

    Promise.all([
      fetchStats('/api/pool-stats.json'),
      fetchStats('/api/solo-stats.json'),
      fetchStats('/api/node-stats.json'),
    ]).then(function (results) {
      var poolData = results[0]
      var soloData = results[1]
      var nodeData = results[2]

      var anyOnline = poolData || soloData || nodeData
      if (anyOnline) {
        badge.textContent = 'Online'
        badge.classList.add('online')
      } else {
        badge.textContent = 'Waiting...'
        badge.classList.remove('online')
      }

      updateCard('pool', poolData)
      updateCard('solo', soloData)
      updateBlockchain(nodeData)
      updateEta(poolData, soloData, nodeData)
      updateWorkers(poolData, soloData)
    })
  }

  // Add SVG gradient for the ring
  var svg = document.querySelector('.sync-ring svg')
  if (svg) {
    var defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
    var grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient')
    grad.id = 'ring-gradient'
    var s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop')
    s1.setAttribute('offset', '0%')
    s1.setAttribute('stop-color', '#f7931a')
    var s2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop')
    s2.setAttribute('offset', '100%')
    s2.setAttribute('stop-color', '#0ac18e')
    grad.appendChild(s1)
    grad.appendChild(s2)
    defs.appendChild(grad)
    svg.insertBefore(defs, svg.firstChild)
  }

  tick()
  setInterval(tick, REFRESH_MS)
})()
