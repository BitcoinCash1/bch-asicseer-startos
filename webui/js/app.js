// ASICSeer Dashboard — fetches stats every 5 seconds
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

  function formatNumber(n) {
    if (n == null || isNaN(n)) return '—'
    return Number(n).toLocaleString()
  }

  function updateCard(prefix, data) {
    var stats = (data && data.stats) || {}
    var users = (data && data.users) || {}

    var el = function (id) { return document.getElementById(id) }

    el(prefix + '-hashrate').textContent = formatHashrate(
      stats.hashrate5m || stats.hashrate1m || stats.hashrate,
    )
    el(prefix + '-workers').textContent = formatNumber(
      users.connectedclients || stats.users || 0,
    )
    el(prefix + '-blocks').textContent = formatNumber(
      stats.SolvedBlocks || stats.accepted || 0,
    )
    el(prefix + '-bestshare').textContent = formatNumber(
      stats.bestshare || stats.best_share || 0,
    )
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
    var badge = document.getElementById('status-badge')

    Promise.all([
      fetchStats('/api/pool-stats.json'),
      fetchStats('/api/solo-stats.json'),
    ]).then(function (results) {
      var poolData = results[0]
      var soloData = results[1]
      var anyOnline = poolData || soloData

      if (anyOnline) {
        badge.textContent = 'Online'
        badge.classList.add('online')
      } else {
        badge.textContent = 'Waiting...'
        badge.classList.remove('online')
      }

      updateCard('pool', poolData)
      updateCard('solo', soloData)
    })
  }

  tick()
  setInterval(tick, REFRESH_MS)
})()
