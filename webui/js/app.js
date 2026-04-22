// ASICSeer Dashboard — fetches pool + blockchain stats every 5 seconds
;(function () {
  'use strict'

  var REFRESH_MS = 5000
  var loggedInAddress = ''   // current address filter (empty = show all)

  // ── Luck helpers ──────────────────────────────────────────────────
  // pool.status "diff" = (accounted_diff_shares / network_diff) * 100
  //   e.g. diff=150.0 means 1.5 blocks worth of work submitted total
  // round_pct  = progress toward next block = diff - (solved * 100)
  //   0% = just started / just found a block
  //   100% = statistically due for next block
  //   >100% = running over schedule (unlucky)
  // luck_pct   = overall luck = solved / (diff/100) * 100
  //   >100% = found more blocks than expected (lucky)
  //   <100% = found fewer blocks than expected (unlucky)
  function computeLuck(stats) {
    var diffPct = parseFloat(stats && stats.diff) || 0
    var solved  = parseInt(stats && stats.SolvedBlocks) || 0
    if (diffPct <= 0) return { roundPct: 0, luckPct: null, solved: solved }
    var roundPct = diffPct - (solved * 100)
    if (roundPct < 0) roundPct = 0
    var luckPct = solved > 0 ? (solved * 10000 / diffPct) : null
    return { roundPct: roundPct, luckPct: luckPct, solved: solved }
  }

  function formatLuckPct(pct) {
    if (pct == null || isNaN(pct)) return '—'
    var n = Number(pct)
    var s
    if (n < 0.1)     s = n.toFixed(3)
    else if (n < 10) s = n.toFixed(2)
    else             s = n.toFixed(1)
    return s + '%'
  }

  // Round progress color: low = on track (green), high = over-due (red)
  function roundClass(pct) {
    var n = Number(pct)
    if (n < 80)   return 'luck-good'
    if (n < 120)  return 'luck-ok'
    if (n < 200)  return 'luck-warn'
    return 'luck-bad'
  }

  // Luck color: high = lucky (green), low = unlucky (red)
  function luckClass(pct) {
    var n = Number(pct)
    if (n > 110)  return 'luck-good'
    if (n >= 90)  return 'luck-ok'
    if (n >= 60)  return 'luck-warn'
    return 'luck-bad'
  }

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

  // Format diff-1-weighted share work with an SI suffix (e.g. 176,000,000 -> "176.00 M").
  // ckpool / asicseer-pool report "shares" as a cumulative sum of submitted
  // difficulty — NOT a raw count of submissions — so showing the raw integer
  // (which can easily reach hundreds of millions) is misleading to miners.
  function formatWork(n) {
    if (n == null || isNaN(n) || Number(n) <= 0) return '0'
    var v = Number(n)
    if (v >= 1e15) return (v / 1e15).toFixed(2) + ' P'
    if (v >= 1e12) return (v / 1e12).toFixed(2) + ' T'
    if (v >= 1e9)  return (v / 1e9 ).toFixed(2) + ' G'
    if (v >= 1e6)  return (v / 1e6 ).toFixed(2) + ' M'
    if (v >= 1e3)  return (v / 1e3 ).toFixed(2) + ' K'
    return v.toFixed(0)
  }

  function workerCounter(w, key) {
    var direct = Number(w && w[key])
    if (!isNaN(direct)) return direct
    if (key === 'accepted') {
      var altA = Number(w && (w.shares || w.valid || w.accepted_shares))
      if (!isNaN(altA)) return altA
    }
    if (key === 'rejected') {
      var altR = Number(w && (w.stale || w.invalid || w.rejected_shares))
      if (!isNaN(altR)) return altR
    }
    return null
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

  function normalizeAddress(raw) {
    var s = String(raw || '').trim().toLowerCase()
    if (!s) return ''
    if (s.indexOf('.') > 0) s = s.substring(0, s.indexOf('.'))
    if (s.indexOf('bitcoincash:') === 0) s = s.substring('bitcoincash:'.length)
    return s
  }

  function workerStatus(w) {
    var reported = String(w && w.status || '').toLowerCase()
    var hr5 = Number((w && w.dsps5) || 0)
    var hr60 = Number((w && w.dsps60) || 0)
    var altHrShort = Number((w && (w.hashrate5m || w.hashrate1m || w.hashrate)) || 0)
    var altHrLong = Number((w && (w.hashrate1hr || w.hashrate1d || w.hashrate7d)) || 0)
    if (hr5 > 0 || hr60 > 0 || altHrShort > 0) return 'alive'
    if (altHrLong > 0) return 'idle'

    var lastShare = Number((w && w.lastshare) || 0)
    if (lastShare > 0) {
      var ageSec = Math.floor(Date.now() / 1000) - lastShare
      if (ageSec < 300) return 'alive'
      if (ageSec < 3600) return 'idle'
      return 'dead'
    }

    if (reported === 'alive' || reported === 'idle' || reported === 'dead') return reported
    return w && w.idle ? 'idle' : 'alive'
  }

  function el(id) { return document.getElementById(id) }

  function getConnectedCount(data) {
    var stats = (data && data.stats) || {}
    var users = (data && data.users) || {}
    var fromUsers = Number(users.connectedclients)
    if (!isNaN(fromUsers)) return Math.max(0, Math.floor(fromUsers))
    var fromStats = Number(stats.workers || stats.users || 0)
    if (!isNaN(fromStats)) return Math.max(0, Math.floor(fromStats))
    return 0
  }

  function updateCard(prefix, data) {
    var stats = (data && data.stats) || {}
    var connected = getConnectedCount(data)

    el(prefix + '-hashrate').textContent = formatHashrate(
      stats.hashrate5m || stats.hashrate1m || stats.hashrate
    )
    el(prefix + '-workers').textContent = formatNumber(connected)
    // FIX: don't fall back to stats.accepted here — that field is cumulative
    // diff-1 share WORK (hundreds of millions), not a block count. Using it as
    // a fallback when SolvedBlocks=0 makes "Found Blocks" show garbage numbers.
    var solvedBlocks = (stats.SolvedBlocks != null && !isNaN(stats.SolvedBlocks))
      ? Number(stats.SolvedBlocks)
      : 0
    el(prefix + '-blocks').textContent = formatNumber(solvedBlocks)
    el(prefix + '-bestshare').textContent = formatNumber(
      stats.bestshare || stats.best_share || 0
    )

    // ── Luck metrics ──────────────────────────────────────────────
    var luck = computeLuck(stats)

    var roundEl = el(prefix + '-round-pct')
    if (roundEl) {
      roundEl.textContent = formatLuckPct(luck.roundPct)
      roundEl.className = 'value ' + roundClass(luck.roundPct)
    }

    var luckEl = el(prefix + '-luck')
    if (luckEl) {
      if (luck.luckPct !== null) {
        luckEl.textContent = formatLuckPct(luck.luckPct)
        luckEl.className = 'value ' + luckClass(luck.luckPct)
      } else {
        luckEl.textContent = luck.solved === 0 ? 'No blocks yet' : '—'
        luckEl.className = 'value'
      }
    }
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
    var poolConnected = getConnectedCount(poolData)
    var soloConnected = getConnectedCount(soloData)
    var totalConnected = poolConnected + soloConnected

    var pw = (poolData && poolData.workers) || {}
    var poolList = pw.workers || []
    for (var i = 0; i < poolList.length; i++) {
      poolList[i]._mode = 'pool'
      allWorkers.push(poolList[i])
    }

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
    var defaultEmptyText = 'No miners connected yet. Point your ASIC at the stratum URL above to get started.'

    var activeWorkers = allWorkers.filter(function (w) {
      return workerStatus(w) !== 'dead'
    })

    badge.textContent = totalConnected + ' connected'

    if (activeWorkers.length === 0) {
      empty.textContent = totalConnected > 0
        ? 'Connected workers detected. Waiting for per-worker stats...'
        : defaultEmptyText
      empty.style.display = ''
      wrap.style.display = 'none'
      updateMyDevices([])
      return
    }

    empty.textContent = defaultEmptyText
    empty.style.display = 'none'
    wrap.style.display = ''

    // Sort: alive first, idle second, dead last, then by hashrate descending
    var statusOrder = { alive: 0, idle: 1, dead: 2 }
    activeWorkers.sort(function (a, b) {
      var saKey = workerStatus(a)
      var sbKey = workerStatus(b)
      var sa = statusOrder[saKey] != null ? statusOrder[saKey] : 2
      var sb = statusOrder[sbKey] != null ? statusOrder[sbKey] : 2
      if (sa !== sb) return sa - sb
      var hrA = dspsToHashrate(a.dsps5) || Number(a.hashrate5m || a.hashrate1m || a.hashrate || 0)
      var hrB = dspsToHashrate(b.dsps5) || Number(b.hashrate5m || b.hashrate1m || b.hashrate || 0)
      return hrB - hrA
    })

    // Auto-number workers without a .name suffix
    var autoCount = {}
    for (var a = 0; a < activeWorkers.length; a++) {
      var wn = activeWorkers[a].worker || activeWorkers[a].user || ''
      var di = wn.indexOf('.')
      if (di <= 0 || di === wn.length - 1) {
        var addr = di > 0 ? wn.substring(0, di) : wn
        autoCount[addr] = (autoCount[addr] || 0) + 1
        activeWorkers[a]._autoName = 'worker' + String(autoCount[addr]).padStart(2, '0')
      }
    }

    var html = ''
    for (var k = 0; k < activeWorkers.length; k++) {
      var w = activeWorkers[k]
      var name = w.worker || w.user || '—'
      var shortName
      var dotIdx = name.indexOf('.')
      if (dotIdx > 0 && dotIdx < name.length - 1) {
        shortName = name.substring(dotIdx + 1)
      } else {
        shortName = w._autoName || 'worker'
      }

      var hr5m = formatHashrate(dspsToHashrate(w.dsps5) || Number(w.hashrate5m || w.hashrate1m || w.hashrate || 0))
      var hr60 = formatHashrate(dspsToHashrate(w.dsps60) || Number(w.hashrate60m || w.hashrate || 0))
      var accepted = workerCounter(w, 'accepted')
      var rejected = workerCounter(w, 'rejected')
      var bestDiff = formatDifficulty(w.bestdiff)
      var lastShare = timeAgo(w.lastshare)
      var status = workerStatus(w)
      var statusLabel = status === 'alive' ? 'Alive' : status === 'idle' ? 'Idle' : 'Dead'
      var modeClass = w._mode

      html += '<tr>'
      html += '<td><span class="worker-name">' + escapeHtml(shortName) + '</span>'
      html += '<span class="worker-mode ' + modeClass + '">' + w._mode + '</span></td>'
      html += '<td>' + hr5m + '</td>'
      html += '<td>' + hr60 + '</td>'
      html += '<td>' + formatWork(accepted) + '</td>'
      html += '<td>' + formatNumber(rejected) + '</td>'
      html += '<td>' + bestDiff + '</td>'
      html += '<td>' + lastShare + '</td>'
      html += '<td><span class="status-dot ' + status + '"></span>'
      html += statusLabel + '</td>'
      html += '</tr>'
    }

    tbody.innerHTML = html

    // Update my devices panel if logged in
    updateMyDevices(activeWorkers)
  }

  function escapeHtml(s) {
    var d = document.createElement('div')
    d.appendChild(document.createTextNode(s))
    return d.innerHTML
  }

  // ── Login / Address Filter ────────────────────────────────────────
  function setupLogin() {
    var input = el('login-address')
    var btn = el('login-btn')
    var hint = el('login-hint')

    function doLogin() {
      var addr = (input.value || '').trim()
      if (addr) {
        loggedInAddress = addr
        btn.textContent = 'Logout'
        btn.classList.add('active')
        hint.textContent = 'Showing devices for: ' + addr.substring(0, 16) + '...'
        el('my-devices-card').style.display = ''
        el('uptime-card').style.display = ''
      } else {
        doLogout()
      }
    }

    function doLogout() {
      loggedInAddress = ''
      input.value = ''
      btn.textContent = 'My Devices'
      btn.classList.remove('active')
      hint.textContent = 'Enter your BCH payout address to view only your miners.'
      el('my-devices-card').style.display = 'none'
      el('uptime-card').style.display = 'none'
    }

    btn.addEventListener('click', function () {
      if (loggedInAddress) {
        doLogout()
      } else {
        doLogin()
      }
    })

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') doLogin()
    })
  }

  function updateMyDevices(allWorkers) {
    if (!loggedInAddress) return

    var wanted = normalizeAddress(loggedInAddress)

    var myWorkers = allWorkers.filter(function (w) {
      var name = w.worker || w.user || ''
      return normalizeAddress(name) === wanted
    })

    var empty = el('my-devices-empty')
    var wrap = el('my-devices-table-wrap')
    var badge = el('my-device-count-badge')
    var tbody = el('my-devices-tbody')

    badge.textContent = myWorkers.length

    if (myWorkers.length === 0) {
      empty.style.display = ''
      wrap.style.display = 'none'
      return
    }

    empty.style.display = 'none'
    wrap.style.display = ''

    var html = ''
    for (var i = 0; i < myWorkers.length; i++) {
      var w = myWorkers[i]
      var name = w.worker || w.user || '—'
      var shortName
      var dotIdx = name.indexOf('.')
      if (dotIdx > 0 && dotIdx < name.length - 1) {
        shortName = name.substring(dotIdx + 1)
      } else {
        shortName = w._autoName || 'worker'
      }

      var hr5m = formatHashrate(dspsToHashrate(w.dsps5) || Number(w.hashrate5m || w.hashrate1m || w.hashrate || 0))
      var accepted = workerCounter(w, 'accepted')
      var rejected = workerCounter(w, 'rejected')
      var bestDiff = formatDifficulty(w.bestdiff)
      var status = workerStatus(w)
      var statusLabel = status === 'alive' ? 'Yes' : 'No'

      html += '<tr>'
      html += '<td><span class="worker-name">' + escapeHtml(shortName) + '</span></td>'
      html += '<td><span class="status-dot ' + status + '"></span>' + statusLabel + '</td>'
      html += '<td>' + hr5m + '</td>'
      html += '<td>' + formatWork(accepted) + '</td>'
      html += '<td>' + formatNumber(rejected) + '</td>'
      html += '<td>' + bestDiff + '</td>'
      html += '</tr>'
    }

    tbody.innerHTML = html

    // Update uptime from first worker's runtime (approximation from pool stats)
    var uptimeEl = el('user-uptime')
    if (myWorkers.length > 0 && myWorkers[0].lastshare > 0) {
      var diff = Math.floor(Date.now() / 1000) - myWorkers[0].lastshare
      uptimeEl.textContent = diff < 300 ? 'Online' : timeAgo(myWorkers[0].lastshare)
    } else {
      uptimeEl.textContent = '—'
    }
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

  // ── Stratum URLs — dynamic, Tor-aware ────────────────────────────
  // The pool exposes stratum on both LAN and Tor (via StartOS MultiHost).
  // The dashboard is served from the same host, so window.location.hostname
  // tells us which interface the user is on. If .onion → show Tor badge.
  function setupStratumUrls() {
    var host = window.location.hostname || 'localhost'
    var isTor = host.endsWith('.onion')

    var poolUrl   = el('pool-stratum-url')
    var soloUrl   = el('solo-stratum-url')
    var poolBadge = el('pool-tor-badge')
    var soloBadge = el('solo-tor-badge')

    if (poolUrl) poolUrl.textContent = 'stratum+tcp://' + host + ':3333'
    if (soloUrl) soloUrl.textContent = 'stratum+tcp://' + host + ':4567'
    var guidePool = el('guide-pool-url')
    var guideSolo = el('guide-solo-url')
    if (guidePool) guidePool.textContent = 'stratum+tcp://' + host + ':3333'
    if (guideSolo) guideSolo.textContent = 'stratum+tcp://' + host + ':4567'

    if (isTor) {
      if (poolBadge) poolBadge.style.display = ''
      if (soloBadge) soloBadge.style.display = ''
    }
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
  setupLogin()
  setupStratumUrls()
})()
