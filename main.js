const appId = '126b088f'
const appKey = 'c275b55f4eec9754dc1a20eff920143c'
const trainStation = 'TRO'
const REFRESH_INTERVAL = 30 // seconds

// Clock
function updateClock() {
  const now = new Date()
  const h = String(now.getHours()).padStart(2, '0')
  const m = String(now.getMinutes()).padStart(2, '0')
  const s = String(now.getSeconds()).padStart(2, '0')
  $('#clock').text(h + ':' + m + ':' + s)
}
setInterval(updateClock, 1000)
updateClock()

// Countdown to next refresh
let refreshCountdown = REFRESH_INTERVAL
function updateCountdown() {
  refreshCountdown--
  if (refreshCountdown <= 0) {
    refreshCountdown = REFRESH_INTERVAL
    fetchDepartures()
  }
  $('#next-refresh').text('Refreshing in ' + refreshCountdown + 's')
}
setInterval(updateCountdown, 1000)

// Determine status text and CSS class from API departure data
function getStatus(dep) {
  const status = (dep.status || '').toUpperCase()

  if (status === 'CANCELLED') {
    return { text: 'Cancelled', cssClass: 'status-cancelled' }
  }
  if (status === 'EARLY') {
    const expected = dep.expected_departure_time || dep.aimed_departure_time
    return { text: expected === dep.aimed_departure_time ? 'On time' : 'Early ' + expected, cssClass: 'status-early' }
  }
  if (status === 'ON TIME' || status === 'RIGHT TIME') {
    return { text: 'On time', cssClass: 'status-on-time' }
  }
  if (status === 'LATE') {
    const expected = dep.expected_departure_time
    if (expected) {
      return { text: 'Exp ' + expected, cssClass: 'status-late' }
    }
    return { text: 'Delayed', cssClass: 'status-delayed' }
  }
  if (status === 'STARTS HERE') {
    return { text: 'Starts here', cssClass: 'status-starts-here' }
  }
  if (status === 'NO REPORT' || status === 'OFF ROUTE') {
    return { text: 'No report', cssClass: 'status-no-report' }
  }

  // If live data returned an expected time but no named status
  if (dep.expected_departure_time && dep.expected_departure_time !== dep.aimed_departure_time) {
    return { text: 'Exp ' + dep.expected_departure_time, cssClass: 'status-late' }
  }
  if (dep.expected_departure_time === dep.aimed_departure_time) {
    return { text: 'On time', cssClass: 'status-on-time' }
  }

  // No live data available
  return { text: '', cssClass: '' }
}

// Check if a departure is imminent (within 1 minute estimate)
function isImminent(dep) {
  return dep.best_departure_estimate_mins != null && dep.best_departure_estimate_mins <= 1
}

// Build calling-at text from station_detail calling_at data
function getCallingAt(dep) {
  if (!dep.calling_at_list) return ''
  const stops = dep.calling_at_list
    .map(function (stop) { return stop.station_name })
    .join(', ')
  return stops ? 'Calling at: ' + stops : ''
}

// Build a single departure row
function buildRow(dep) {
  const status = getStatus(dep)
  const imminent = isImminent(dep)
  const callingAt = getCallingAt(dep)

  let rowClass = 'departure-row'
  if (status.cssClass === 'status-cancelled') rowClass += ' status-cancelled'
  if (imminent) rowClass += ' imminent'

  let html = '<div class="' + rowClass + '">'
  html += '<span class="col-time">' + dep.aimed_departure_time + '</span>'
  html += '<span class="col-destination">' + dep.destination_name + '</span>'
  html += '<span class="col-plat">' + (dep.platform || '-') + '</span>'
  html += '<span class="col-expected ' + status.cssClass + '">' + status.text + '</span>'
  html += '<span class="col-operator">' + (dep.operator_name || '') + '</span>'

  if (callingAt) {
    html += '<div class="calling-at">' + callingAt + '</div>'
  }

  html += '</div>'
  return html
}

// Main fetch
function fetchDepartures() {
  const url = 'https://transportapi.com/v3/uk/train/station_timetables/' +
    trainStation + '.json?app_id=' + appId + '&app_key=' + appKey +
    '&train_status=passenger&live=true&station_detail=calling_at'

  $('#departures').html('<div class="loading-message">Loading departures...</div>')

  $.getJSON(url)
    .done(function (data) {
      $('#station-name').text(data.station_name || trainStation)
      document.title = 'Live Departures - ' + (data.station_name || trainStation)

      const departures = data.departures && data.departures.all
      if (!departures || departures.length === 0) {
        $('#departures').html('<div class="loading-message">No departures found</div>')
        $('#updated').text('Updated: ' + new Date().toLocaleTimeString())
        return
      }

      const rows = departures.map(buildRow).join('')
      $('#departures').html(rows)
      $('#updated').text('Updated: ' + new Date().toLocaleTimeString())
    })
    .fail(function (jqXHR) {
      let msg = 'Failed to load departures'
      if (jqXHR.status === 429) msg = 'Rate limited - will retry shortly'
      else if (jqXHR.status === 401 || jqXHR.status === 403) msg = 'Invalid API credentials'
      else if (jqXHR.status === 0) msg = 'Network error - check your connection'
      $('#departures').html('<div class="error-message">' + msg + '</div>')
    })
}

// Initial load
fetchDepartures()
