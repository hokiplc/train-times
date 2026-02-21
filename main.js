const appId = '126b088f'
const appKey = 'c275b55f4eec9754dc1a20eff920143c'
const DEFAULT_STATION = 'TRO'
const REFRESH_INTERVAL = 30 // seconds

let currentStation = DEFAULT_STATION
let maxDepartures = 0 // 0 = show all
let stations = []
let showCallingAt = false
let refreshCountdown = REFRESH_INTERVAL
let activeResultIndex = -1
let lastDepartures = [] // store latest departures for calling-at fetching
let lastDate = ''       // date from latest API response
let callingAtCache = {} // keyed by train_uid:date

// Read config from URL query parameters and hash
// Supports: ?stops=8&callingat=on  and  #TRO  (or combined: ?stops=8#TRO)
function getUrlParams() {
  var params = new URLSearchParams(window.location.search)
  return {
    stops: parseInt(params.get('stops'), 10) || 0,
    callingat: params.get('callingat')
  }
}

// Read station from URL hash, e.g. #TRO
function getStationFromHash() {
  const hash = window.location.hash.replace('#', '').toUpperCase()
  return hash.length === 3 ? hash : null
}

function setStationHash(crs) {
  window.location.hash = crs
}

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
function updateCountdown() {
  refreshCountdown--
  if (refreshCountdown <= 0) {
    refreshCountdown = REFRESH_INTERVAL
    fetchDepartures()
  }
  $('#next-refresh').text('Refreshing in ' + refreshCountdown + 's')
}
setInterval(updateCountdown, 1000)

// Load stations list
function loadStations() {
  $.getJSON('stations.json')
    .done(function (data) {
      stations = data
    })
    .fail(function () {
      console.warn('Could not load stations.json')
    })
}

// Station search
function initSearch() {
  const $input = $('#station-search')
  const $results = $('#station-results')

  $input.on('input', function () {
    const query = $(this).val().trim().toLowerCase()
    activeResultIndex = -1

    if (query.length < 2) {
      $results.hide().empty()
      return
    }

    // Filter: match station name or CRS code
    const matches = stations.filter(function (s) {
      return s.stationName.toLowerCase().indexOf(query) !== -1 ||
             s.crsCode.toLowerCase() === query
    }).slice(0, 20)

    if (matches.length === 0) {
      $results.hide().empty()
      return
    }

    const html = matches.map(function (s, i) {
      return '<div class="station-option" data-crs="' + s.crsCode + '" data-index="' + i + '">' +
        s.stationName + '<span class="crs">(' + s.crsCode + ')</span></div>'
    }).join('')

    $results.html(html).show()
  })

  // Keyboard navigation
  $input.on('keydown', function (e) {
    const $options = $results.find('.station-option')
    if ($options.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      activeResultIndex = Math.min(activeResultIndex + 1, $options.length - 1)
      $options.removeClass('active').eq(activeResultIndex).addClass('active')
      scrollOptionIntoView($results, $options.eq(activeResultIndex))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      activeResultIndex = Math.max(activeResultIndex - 1, 0)
      $options.removeClass('active').eq(activeResultIndex).addClass('active')
      scrollOptionIntoView($results, $options.eq(activeResultIndex))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeResultIndex >= 0) {
        $options.eq(activeResultIndex).trigger('click')
      }
    } else if (e.key === 'Escape') {
      $results.hide().empty()
      $input.blur()
    }
  })

  // Click a result
  $results.on('click', '.station-option', function () {
    const crs = $(this).data('crs')
    selectStation(crs)
    $input.val('')
    $results.hide().empty()
  })

  // Close results when clicking outside
  $(document).on('click', function (e) {
    if (!$(e.target).closest('#station-search-wrap').length) {
      $results.hide().empty()
    }
  })
}

function scrollOptionIntoView($container, $option) {
  if (!$option.length) return
  const optionTop = $option.position().top
  const optionHeight = $option.outerHeight()
  const containerHeight = $container.height()
  const scrollTop = $container.scrollTop()

  if (optionTop < 0) {
    $container.scrollTop(scrollTop + optionTop)
  } else if (optionTop + optionHeight > containerHeight) {
    $container.scrollTop(scrollTop + optionTop + optionHeight - containerHeight)
  }
}

function selectStation(crs) {
  currentStation = crs
  setStationHash(crs)
  callingAtCache = {}
  refreshCountdown = REFRESH_INTERVAL
  fetchDepartures()
}

// Calling-at toggle
function initCallingAtToggle() {
  $('#calling-at-toggle').on('click', function () {
    showCallingAt = !showCallingAt
    $(this).text('Calling at: ' + (showCallingAt ? 'ON' : 'OFF'))
    $(this).toggleClass('active', showCallingAt)
    $('#departures').toggleClass('show-calling-at', showCallingAt)

    if (showCallingAt) {
      fetchCallingAtForAll()
    }
  })
}

// Fetch the service timetable for a single departure and update its row
function fetchCallingAtForDeparture(dep, date) {
  var cacheKey = dep.train_uid + ':' + date
  var $row = $('[data-uid="' + dep.train_uid + '"]')
  var $callingAt = $row.find('.calling-at')

  // Already cached
  if (callingAtCache[cacheKey]) {
    $callingAt.text(callingAtCache[cacheKey])
    return
  }

  $callingAt.text('Loading...')

  var url = 'https://transportapi.com/v3/uk/train/service_timetables/' +
    dep.train_uid + ':' + date + '.json?app_id=' + appId +
    '&app_key=' + appKey + '&live=true'

  $.getJSON(url)
    .done(function (data) {
      var stops = data.stops || []
      // Find current station in the stops list, then show all stops after it
      var foundCurrent = false
      var callingPoints = []
      for (var i = 0; i < stops.length; i++) {
        if (foundCurrent) {
          callingPoints.push(stops[i].station_name)
        }
        if (stops[i].station_code === currentStation) {
          foundCurrent = true
        }
      }

      var text = callingPoints.length > 0
        ? 'Calling at: ' + callingPoints.join(', ')
        : 'No calling points'

      callingAtCache[cacheKey] = text

      // Re-find the row in case DOM was refreshed
      var $updatedRow = $('[data-uid="' + dep.train_uid + '"]')
      $updatedRow.find('.calling-at').text(text)
    })
    .fail(function () {
      var $updatedRow = $('[data-uid="' + dep.train_uid + '"]')
      $updatedRow.find('.calling-at').text('Unavailable')
    })
}

// Fetch calling-at for all currently displayed departures
function fetchCallingAtForAll() {
  if (!lastDepartures.length || !lastDate) return

  lastDepartures.forEach(function (dep) {
    fetchCallingAtForDeparture(dep, lastDate)
  })
}

// Determine status text and CSS class from API departure data
function getStatus(dep) {
  var status = (dep.status || '').toUpperCase()

  if (status === 'CANCELLED') {
    return { text: 'Cancelled', cssClass: 'status-cancelled' }
  }
  if (status === 'EARLY') {
    var expected = dep.expected_departure_time || dep.aimed_departure_time
    return { text: expected === dep.aimed_departure_time ? 'On time' : 'Early ' + expected, cssClass: 'status-early' }
  }
  if (status === 'ON TIME' || status === 'RIGHT TIME') {
    return { text: 'On time', cssClass: 'status-on-time' }
  }
  if (status === 'LATE') {
    var exp = dep.expected_departure_time
    if (exp) {
      return { text: 'Exp ' + exp, cssClass: 'status-late' }
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

// Build a single departure row
function buildRow(dep, date) {
  var status = getStatus(dep)
  var imminent = isImminent(dep)
  var cacheKey = dep.train_uid + ':' + date
  var cachedCallingAt = callingAtCache[cacheKey] || ''

  var rowClass = 'departure-row'
  if (status.cssClass === 'status-cancelled') rowClass += ' status-cancelled'
  if (imminent) rowClass += ' imminent'

  var html = '<div class="' + rowClass + '" data-uid="' + dep.train_uid + '">'
  html += '<span class="col-time">' + dep.aimed_departure_time + '</span>'
  html += '<span class="col-destination">' + dep.destination_name + '</span>'
  html += '<span class="col-plat">' + (dep.platform || '-') + '</span>'
  html += '<span class="col-expected ' + status.cssClass + '">' + status.text + '</span>'
  html += '<span class="col-operator">' + (dep.operator_name || '') + '</span>'
  html += '<div class="calling-at">' + cachedCallingAt + '</div>'
  html += '</div>'
  return html
}

// Main fetch
function fetchDepartures() {
  var url = 'https://transportapi.com/v3/uk/train/station_timetables/' +
    currentStation + '.json?app_id=' + appId + '&app_key=' + appKey +
    '&train_status=passenger&live=true'

  $('#departures').html('<div class="loading-message">Loading departures...</div>')

  $.getJSON(url)
    .done(function (data) {
      $('#station-name').text(data.station_name || currentStation)
      document.title = 'Live Departures - ' + (data.station_name || currentStation)

      var departures = data.departures && data.departures.all
      if (!departures || departures.length === 0) {
        $('#departures').html('<div class="loading-message">No departures found</div>')
        $('#updated').text('Updated: ' + new Date().toLocaleTimeString())
        lastDepartures = []
        return
      }

      if (maxDepartures > 0) {
        departures = departures.slice(0, maxDepartures)
      }

      lastDepartures = departures
      lastDate = data.date || ''

      var rows = departures.map(function (dep) {
        return buildRow(dep, lastDate)
      }).join('')

      var $dep = $('#departures')
      $dep.html(rows)
      if (showCallingAt) {
        $dep.addClass('show-calling-at')
        fetchCallingAtForAll()
      }
      $('#updated').text('Updated: ' + new Date().toLocaleTimeString())
    })
    .fail(function (jqXHR) {
      var msg = 'Failed to load departures'
      if (jqXHR.status === 429) msg = 'Rate limited - will retry shortly'
      else if (jqXHR.status === 401 || jqXHR.status === 403) msg = 'Invalid API credentials'
      else if (jqXHR.status === 0) msg = 'Network error - check your connection'
      $('#departures').html('<div class="error-message">' + msg + '</div>')
    })
}

// Handle browser back/forward with hash change
$(window).on('hashchange', function () {
  var crs = getStationFromHash()
  if (crs && crs !== currentStation) {
    currentStation = crs
    callingAtCache = {}
    refreshCountdown = REFRESH_INTERVAL
    fetchDepartures()
  }
})

// Initialise
$(function () {
  loadStations()
  initSearch()
  initCallingAtToggle()

  // Read URL query parameters (?stops=8&callingat=on)
  var params = getUrlParams()
  if (params.stops > 0) {
    maxDepartures = params.stops
  }
  if (params.callingat === 'on') {
    showCallingAt = true
    $('#calling-at-toggle').text('Calling at: ON').addClass('active')
    $('#departures').addClass('show-calling-at')
  }

  // Use hash station if present, otherwise default
  var hashStation = getStationFromHash()
  if (hashStation) {
    currentStation = hashStation
  } else {
    setStationHash(currentStation)
  }

  fetchDepartures()
})
