//
// For guidance on how to create routes see:
// https://prototype-kit.service.gov.uk/docs/create-routes
//

const govukPrototypeKit = require('govuk-prototype-kit')
const router = govukPrototypeKit.requests.setupRouter()

// ---------------------------------------------------------------------------
// Returning to the tab someone came from
// ---------------------------------------------------------------------------
//
// Sub-pages like "New dependant" or "New exclusion" open from a tab on a
// parent page. When they save, they should land back on that tab rather than
// on the first one.
//
// A form cannot do this on its own: a fragment like #dependants in a form
// action is dropped when the form posts. A redirect keeps it, because the
// fragment travels in the Location header.
//
// The link that opens each sub-page carries the destination as a query
// string, for example /newexclusion?returnTo=/a14esa%23exclusions. The kit
// stores that in session data, and this route redirects to it.
//

// ===========================================================================
// A14 tables - storing what the sub-pages save
// ===========================================================================
//
// Every "New benefit week", "New exclusion", "New dependant" sub-page already
// posts to /return-to-tab. That is the hook: nothing in those pages needs
// changing. What is missing is that the answers were thrown away on the way
// back, so the table on the tab always said "No ... recorded".
//
// Which table an entry belongs in is worked out from the sub-page it came
// from - selectnewbenefitweek is a benefit week, newexclusionisjsa is an
// exclusion - so the same code serves all three A14 forms without knowing
// which one is open.
//
// Order matters below: nondependant is checked before dependant, and
// benefitweek before benefit, or the shorter word would match first.
//
// Some field names are used by more than one page - benefitWeekType is on the
// benefit details page as well as the benefit week sub-page. Clearing a
// sub-page's fields must not wipe an answer given elsewhere.
const sharedFields = [
  'benefitWeekType', 'initialBenefitWeek', 'benefit', 'benefitLabel'
]

// Takes a copy of the shared fields before a sub-page opens, so the values
// the case already holds can be put back after that page posts.
function snapshotShared (data) {
  const before = {}

  sharedFields.forEach(function (field) {
    if (data[field] !== undefined) { before[field] = data[field] }
  })

  data.a14SharedBefore = before
}

const a14RowTypes = [
  { match: /nondependant/, key: 'a14NonDependants', label: 'non-dependant' },
  { match: /benefitweek/, key: 'a14BenefitWeeks', label: 'benefit week' },
  { match: /exclusion/, key: 'a14Exclusions', label: 'exclusion' },
  { match: /dependant/, key: 'a14Dependants', label: 'dependant' },
  { match: /otherincome/, key: 'a14OtherIncome', label: 'other income' },
  { match: /benefit/, key: 'a14Benefits', label: 'benefit' }
]

// QB16 has its own tables, and its sub-pages are named in a way that would
// otherwise fall into the A14 list above - qb16bwebwcnewbenefit contains
// "benefit", so without this a QB16 benefit week would be filed as an A14
// benefit. So anything with qb16 in the name is matched here first.
//
// A null key means the page posts to /return-to-tab but is not a row: the
// insert standard text page fills in the Cause box rather than adding a line
// to a table.
const qb16RowTypes = [
  { match: /standardtext/, key: null, label: 'standard text' },
  { match: /newbenefit/, key: 'qb16BenefitWeeks', label: 'benefit week' },
  { match: /newexclusion/, key: 'qb16Exclusions', label: 'exclusion' },
  { match: /entrydetails/, key: 'qb16Entries', label: 'entry' }
]

// The DCC sub-pages have the same problem as QB16, and worse: a page called
// dccisjsabwebwcnewbenefitweek contains "benefitweek", so without this a DCC
// benefit week would be filed in the A14 table.
//
// The table names are built from the benefit in the page name, so this works
// for the PC/IS and ESA paths as they arrive - dccpcispcassets... files into
// dccPcispcAssets without another line here.
function dccRowTypeFor (segment) {
  const variant = /isjsa/.test(segment)
    ? 'Isjsa'
    : (/pcispc/.test(segment) ? 'Pcispc' : (/esa/.test(segment) ? 'Esa' : ''))

  if (!variant) { return null }

  const base = 'dcc' + variant

  // Order matters. An asset value page also has "asset" in its name, so it is
  // matched first.
  if (/showvalues|newvalue/.test(segment)) { return { key: base + 'AssetValues', label: 'asset value' } }
  if (/asset/.test(segment)) { return { key: base + 'Assets', label: 'asset' } }
  if (/benefitweek|newbenefit/.test(segment)) { return { key: base + 'BenefitWeeks', label: 'benefit week' } }
  if (/exclusion/.test(segment)) { return { key: base + 'Exclusions', label: 'exclusion' } }

  return null
}

function rowTypeFor (segment) {
  if (segment.indexOf('dcc') !== -1) { return dccRowTypeFor(segment) }

  if (segment.indexOf('qb16') !== -1) {
    for (let i = 0; i < qb16RowTypes.length; i++) {
      if (qb16RowTypes[i].match.test(segment)) {
        return qb16RowTypes[i].key ? qb16RowTypes[i] : null
      }
    }
    return null
  }

  for (let i = 0; i < a14RowTypes.length; i++) {
    if (a14RowTypes[i].match.test(segment)) { return a14RowTypes[i] }
  }
  return null
}

// Turns a posted form into a row.
//
// Date inputs arrive as three separate fields. Each set is also joined into
// one dd/mm/yyyy value under the prefix, so a table can show a date without
// having to reassemble it: bwDateOfChange-day/-month/-year also gives
// bwDateOfChange = "05/05/2003".
function buildRow (body) {
  const ignore = ['returnTo', 'rowType', 'rowIndex', 'action', '_csrf']
  const row = {}

  Object.keys(body).forEach(function (field) {
    if (ignore.indexOf(field) === -1) { row[field] = body[field] }
  })

  function pad (value) {
    const text = String(value === undefined ? '' : value).trim()
    return text.length === 1 ? '0' + text : text
  }

  Object.keys(row).forEach(function (field) {
    const match = field.match(/^(.*)-day$/)
    if (!match) { return }

    const prefix = match[1]
    if (row[prefix + '-month'] === undefined || row[prefix + '-year'] === undefined) { return }

    const day = pad(row[field])
    const month = pad(row[prefix + '-month'])
    const year = String(row[prefix + '-year'] || '').trim()

    row[prefix] = (day || month || year) ? day + '/' + month + '/' + year : ''
  })

  return row
}

// ---------------------------------------------------------------------------
// Keeping what is typed on an A14 form itself
// ---------------------------------------------------------------------------
//
// The tabs on an A14 page are one big form, and the Prototype Kit only saves
// posted fields - so nothing typed there is kept until "Generate A14 forms" is
// pressed. Click "New benefit week" from a tab and the link navigates away
// without submitting, and every answer on every tab is lost.
//
// This route takes a copy of the form as it stands and merges it into the
// session, so leaving the page does not throw the answers away. The script on
// the A14 pages calls it as fields change and before following any link.
//
// It only ever merges - it never clears anything it was not sent - and the
// keys the journey depends on are protected, so a stray field named 'benefit'
// on some page cannot overwrite the case's benefit type.
//
const protectedKeys = [
  'benefit', 'benefitLabel', 'savedCases', 'a14SubPage',
  'a14BenefitWeeks', 'a14Exclusions', 'a14Benefits',
  'a14OtherIncome', 'a14Dependants', 'a14NonDependants'
]

router.post('/a14-autosave', function (req, res) {
  const data = req.session.data || {}
  const body = req.body || {}

  Object.keys(body).forEach(function (field) {
    if (protectedKeys.indexOf(field) > -1) { return }
    if (field === '_csrf' || field === 'returnTo') { return }
    data[field] = body[field]
  })

  res.end('')
})

// ---------------------------------------------------------------------------
// The case overview
// ---------------------------------------------------------------------------
//
// There were two: /onboarding/case-overview with statuses, and
// /A14/a14caseoverview with View and Edit actions. Same case, two answers.
// One page now does both, and /A14/a14caseoverview redirects to it.
//
// CASE_OVERVIEW_PAGE is declared further down, with the other addresses -
// app/views has to be indexed before it can be worked out. The routes here
// only read it when a request arrives, by which point it is set.

// Generating the A14 forms. All three A14 pages post here - a14.html and
// a14isjsa.html to /a14caseoverview, a14esa.html to /a14forms - so both
// addresses are handled rather than asking you to edit three templates.
function generateA14 (req, res) {
  // Not "req.session.data || {}". If the session has no data object yet, that
  // writes the banner onto a throwaway object that is discarded the moment
  // this function returns - the flag is set, and then it is gone.
  if (!req.session.data) { req.session.data = {} }
  const data = req.session.data

  data.a14Complete = 'yes'
  data.caseBanner = 'a14'
  delete data.caseBannerSeen

  // Says so in your terminal. If you press "Generate A14 forms" and this line
  // does not appear, the button is not reaching routes.js at all - which is a
  // different problem from the banner not showing.
  console.log('Generate A14 forms: banner set, redirecting to ' + CASE_OVERVIEW_PAGE)

  res.redirect(CASE_OVERVIEW_PAGE)
}

// Declared as real routes as well as through postHandlers below, so nothing
// registered later can shadow them. Express matches in declaration order.
router.post('/a14caseoverview', generateA14)
router.post('/A14/a14caseoverview', generateA14)
router.post('/a14forms', generateA14)
router.post('/A14/a14forms', generateA14)

// The confirmation you land on straight after creating a case. It was a third
// copy of the case overview - a task list whose links went to "#" or to
// addresses that have since moved, and buttons that submitted nowhere. Its one
// real job is the green "case created" message, and the case overview can
// carry that itself.
//
// So this sets the banner and goes there. Every link on the page you land on
// is the same set that already works, for every benefit path, and there is one
// page to keep right rather than three.
//
// Delete these lines if you want the separate page back.
// Anything belonging to the records of a case, as opposed to the customer it
// is about. Cleared when a new case starts, so a fresh case does not inherit
// the last one's A14 forms, QB16 entries or DCC.
//
// The benefit, the customer's details and the discrepancy period are not here:
// they are what was just entered, and they describe the case rather than the
// work done on it.
const RECORD_FIELD_PREFIXES = [
  'a14', 'qb16', 'esa', 'isjsa', 'pcispc', 'dcc',
  'bwDateOfChange', 'benefitPayDay', 'exclusion', 'gross', 'net', 'taxable',
  'underpaid', 'calculationOptions', 'cause', 'standardText',
  'personalAllowance', 'partWeek', 'entryForm', 'adjustDates', 'formsToPrint',
  'a14sToPrint', 'delete', 'edit', 'action', 'assetIndex', 'showValues'
]

function clearRecords (data) {
  Object.keys(data).forEach(function (field) {
    // Every table of rows, whatever it is called. This catches the ESA arrays
    // too, which are named esaRates rather than dccEsaRates.
    if (Array.isArray(data[field])) {
      delete data[field]
      return
    }

    if (RECORD_FIELD_PREFIXES.some(function (prefix) { return field.indexOf(prefix) === 0 })) {
      delete data[field]
    }
  })

  delete data.a14Complete
  delete data.qb16Complete
  delete data.dccComplete
  delete data.caseBannerSeen
}

function caseCreated (req, res) {
  if (!req.session.data) { req.session.data = {} }

  const data = req.session.data

  // A different customer means a different case, so it starts with nothing
  // recorded against it. Coming back to this address for the same case - the
  // back button, a bookmark - changes nothing, which is why this compares
  // rather than clearing every time.
  const nino = data.nino || ''

  if (data.caseRecordsFor !== nino) {
    clearRecords(data)
    data.caseRecordsFor = nino

    console.log('New case' + (nino ? ' for ' + nino : '') + ': previous records cleared')
  }

  data.caseBanner = 'created'
  delete data.caseBannerSeen

  res.redirect(CASE_OVERVIEW_PAGE)
}

// Starts a case from scratch without going through the journey - handy while
// testing, and safe: it only clears the records, not the customer.
router.get('/new-case', function (req, res) {
  if (!req.session.data) { req.session.data = {} }

  clearRecords(req.session.data)
  delete req.session.data.caseRecordsFor

  res.redirect(CASE_OVERVIEW_PAGE)
})

router.get('/onboarding/case-overview-confirmation', caseCreated)
router.get('/case-overview-confirmation', caseCreated)
router.get('/onboarding/case-overviewconfirmation', caseCreated)
router.get('/caseoverviewconfirmation', caseCreated)
router.post('/case-overview-confirmation', caseCreated)
router.post('/onboarding/case-overview-confirmation', caseCreated)

// The old A14 case overview. Everything it showed is on the one overview now.
// Delete these two lines if you want that page back.
router.get('/a14caseoverview', function (req, res) { res.redirect(CASE_OVERVIEW_PAGE) })
router.get('/A14/a14caseoverview', function (req, res) { res.redirect(CASE_OVERVIEW_PAGE) })

// Shows what the banner logic currently thinks, without opening anything.
router.get('/banner-check', function (req, res) {
  const data = (req.session && req.session.data) || {}

  res.send('<!DOCTYPE html><html><head><title>Banner check</title></head>' +
    '<body style="font-family:sans-serif;padding:2rem;max-width:40rem">' +
    '<h1>Banner check</h1>' +
    '<p>caseBanner is <strong>' + (data.caseBanner || 'not set') + '</strong></p>' +
    '<p>a14Complete is <strong>' + (data.a14Complete || 'not set') + '</strong></p>' +
    '<p>The overview page is <strong>' + CASE_OVERVIEW_PAGE + '</strong></p>' +
    '<hr>' +
    '<p>Press "Generate A14 forms" on any A14 page, then come straight back ' +
    'here without clicking anything else.</p>' +
    '<ul>' +
    '<li>Both set: the routing works, so the banner is not rendering - check ' +
    'that govukNotificationBanner is available on your other pages.</li>' +
    '<li>Neither set: the button is not reaching routes.js. Check the form ' +
    'action on that A14 page.</li>' +
    '</ul>' +
    '<p><a href="' + CASE_OVERVIEW_PAGE + '">Go to the case overview</a></p>' +
    '</body></html>')
})

// Lists what has actually been stored in each A14 table, and the field names
// each row carries. Visit /a14-fields after saving one entry from each
// sub-page - it is the quickest way to confirm a table column is reading the
// right field, without opening any templates.
router.get('/a14-fields', function (req, res) {
  const data = (req.session && req.session.data) || {}

  // Every table in the case, not just the A14 ones. There are fifteen of them
  // now across A14, QB16 and the three DCC paths, so this finds them rather
  // than listing them: anything in the session that is an array of objects.
  const keys = Object.keys(data).filter(function (key) {
    return Array.isArray(data[key]) && data[key].length &&
      typeof data[key][0] === 'object' && data[key][0] !== null
  }).sort()

  const sections = keys.length
    ? keys.map(function (key) {
      const rows = data[key]
      const fields = Object.keys(rows[0])

      return '<h2 class="govuk-heading-m"><code>data.' + key + '</code></h2>' +
        '<p class="govuk-body">' + rows.length + (rows.length === 1 ? ' row' : ' rows') + '</p>' +
        '<table class="govuk-table"><thead class="govuk-table__head"><tr class="govuk-table__row">' +
        '<th scope="col" class="govuk-table__header">Field name</th>' +
        '<th scope="col" class="govuk-table__header">Value in the first row</th></tr></thead>' +
        '<tbody class="govuk-table__body">' +
        fields.map(function (field) {
          return '<tr class="govuk-table__row">' +
            '<td class="govuk-table__cell"><code>' + field + '</code></td>' +
            '<td class="govuk-table__cell">' + String(rows[0][field]) + '</td></tr>'
        }).join('') +
        '</tbody></table>'
    }).join('')
    : '<p class="govuk-body">Nothing saved yet. Add an entry from any sub-page, then come back.</p>'

  res.send('<!DOCTYPE html><html><head><title>What is stored</title>' +
    '<link rel="stylesheet" href="/govuk/govuk/govuk-frontend.min.css"></head>' +
    '<body class="govuk-template__body"><div class="govuk-width-container">' +
    '<main class="govuk-main-wrapper">' +
    '<h1 class="govuk-heading-l">What is stored against this case</h1>' +
    '<p class="govuk-body">Every table, with the field names each row carries. ' +
    'If a column on a page comes out blank, the name it is looking for is not in this list.</p>' +
    sections +
    '</main></div></body></html>')
})

router.get('/a14-row-edit', function (req, res) {
  const data = req.session.data || {}
  const key = req.query.key
  const index = req.query.index
  const row = (data[key] || [])[index]

  if (!row) {
    return res.redirect(req.query.returnTo || '/opcalctype')
  }

  snapshotShared(data)

  Object.keys(row).forEach(function (field) {
    if (field.charAt(0) !== '_') { data[field] = row[field] }
  })

  data.a14EditKey = key
  data.a14EditIndex = index
  data.returnTo = row._returnTo || req.query.returnTo || ''

  // Rows saved before Edit existed have no _page, so there is nothing to
  // reopen. Say so rather than bouncing somewhere unexpected.
  if (!row._page) {
    data.a14EditKey = ''
    data.a14EditIndex = ''
    return res.redirect(req.query.returnTo || '/opcalctype')
  }

  res.redirect(row._page)
})

// Delete a row from one of the A14 tables.
router.get('/a14-row-delete', function (req, res) {
  const data = req.session.data || {}
  const key = req.query.key
  const index = req.query.index

  if (key && data[key]) {
    data[key] = data[key].filter(function (row, i) { return String(i) !== String(index) })
  }

  res.redirect(req.query.returnTo || '/opcalctype')
})

router.post('/return-to-tab', function (req, res) {
  const data = req.session.data
  const destination = req.body.returnTo || data.returnTo

  // Save the answers into the table they belong to, rather than dropping them
  // on the way back to the tab.
  const rowType = rowTypeFor(data.a14SubPage || '')

  if (rowType) {
    const row = buildRow(req.body)

    // An empty submit - Cancel, or a form with nothing filled in - should not
    // add a blank line to the table.
    const hasSomething = Object.keys(row).some(function (field) {
      return String(row[field] === undefined ? '' : row[field]).trim() !== ''
    })

    if (hasSomething) {
      data[rowType.key] = data[rowType.key] || []

      // Where this entry was made, so Edit can reopen the same sub-page on the
      // same tab. Underscored so it cannot collide with a real field name.
      row._page = data.a14SubPagePath || ''
      row._returnTo = destination || ''

      // Set by an Edit link. When it is there the entry replaces the row it
      // came from rather than adding a second copy.
      const editing = data.a14EditKey === rowType.key &&
                      data.a14EditIndex !== undefined && data.a14EditIndex !== ''

      if (editing) {
        data[rowType.key][data.a14EditIndex] = row
      } else {
        data[rowType.key].push(row)
      }
    }

    // benefitWeekType is on the benefit details page as well as the benefit
    // week sub-page. Without this, adding a benefit week would silently
    // change the case's BWE/BWC answer to whatever the sub-page said.
    const before = data.a14SharedBefore || {}

    sharedFields.forEach(function (field) {
      if (before[field] !== undefined) {
        data[field] = before[field]
      } else if (Object.keys(before).length) {
        delete data[field]
      }
    })

    delete data.a14SharedBefore
    delete data.a14SubPage
    delete data.a14SubPagePath
    delete data.a14EditKey
    delete data.a14EditIndex
  }


  // Clear it once used. Otherwise a sub-page opened later without its own
  // returnTo would send someone back to whatever tab was visited last.
  delete req.session.data.returnTo

  res.redirect(destination || '/opcalctype')
})

// ===========================================================================
// Benefit type - the fork the rest of the case runs down
// ===========================================================================
//
// The benefit is chosen once, on /selectbenefit, and stored as data.benefit.
// Everything after that reads it: which A14 form opens, which DCC opens, and
// which rows /opcalctype offers.
//
// The keys are the values posted by the radios on /selectbenefit, so the two
// lists have to agree. If you add a benefit in one place, add it in the other.
//
// available: false greys the radio out on /selectbenefit. The a14 path is
// still recorded for IS, JSA and PC because those forms would serve them -
// turning one on is a matter of setting available to true in both files.
//
// benefitWeek and weekType come from the inset text on each A14 form, and are
// set as the starting point on the benefit details page.
const benefits = {
  AA: { label: 'Attendance Allowance (AA)', a14: null, available: false },
  BA: { label: 'Bereavement Allowance (BA)', a14: null, available: false },
  DLA: { label: 'Disability Living Allowance (DLA)', a14: null, available: false },
  ESA: { label: 'Employment and Support Allowance (ESA)', a14: '/a14esa', available: true, benefitWeek: 'Thursday', weekType: 'BWE' },
  IB: { label: 'Incapacity Benefit (IB)', a14: null, available: false },
  IS: { label: 'Income Support (IS)', a14: '/a14isjsa', available: false, benefitWeek: 'Monday', weekType: 'BWC' },
  'IS-JSA': { label: 'Income Support/Jobseeker’s Allowance (IS/JSA)', a14: '/a14isjsa', available: true, benefitWeek: 'Monday', weekType: 'BWC' },
  'IS-PC': { label: 'Income Support/Pension Credit (IS/PC)', a14: '/a14', available: true, benefitWeek: 'Tuesday', weekType: 'BWC' },
  IVB: { label: 'Invalidity Benefit (IVB)', a14: null, available: false },
  'IVB-IB': { label: 'Invalidity/Incapacity Benefit (IVB/IB)', a14: null, available: false },
  JSA: { label: 'Jobseeker’s Allowance (JSA)', a14: '/a14isjsa', available: false, benefitWeek: 'Monday', weekType: 'BWC' },
  MA: { label: 'Maternity Allowance (MA)', a14: null, available: false },
  PIB: { label: 'Passported Incapacity Benefit (PIB)', a14: null, available: false },
  PC: { label: 'Pension Credit (PC)', a14: '/a14', available: false, benefitWeek: 'Tuesday', weekType: 'BWC' },
  RP: { label: 'Retirement Pension (RP)', a14: null, available: false },
  SDA: { label: 'Severe Disablement Allowance (SDA)', a14: null, available: false },
  SB: { label: 'Sickness Benefit (SB)', a14: null, available: false },
  WMA: { label: 'Widowed Mother’s Allowance (WMA)', a14: null, available: false },
  WPA: { label: 'Widowed Parent’s Allowance (WPA)', a14: null, available: false },
  WP: { label: 'Widow’s Pension (WP)', a14: null, available: false }
}

// ---------------------------------------------------------------------------
// Finding the pages, wherever you have put them
// ---------------------------------------------------------------------------
//
// The Prototype Kit builds a page's address from its path under app/views, so
// moving a14esa.html into a folder changed its address from /a14esa to
// "/A14 - ESA/a14esa", and every link pointing at /a14esa stopped resolving.
//
// I had been writing those folder names in by hand. That was the wrong
// approach: it broke the moment a folder was renamed, and it broke silently -
// a wrong path just fell through and looked like the fork failing.
//
// So this looks instead. app/views is walked once at startup and every .html
// file is recorded by name. Folder names then stop mattering: rename them,
// nest them, move a file between them, and the addresses below still resolve.
//
// What it found is printed to the terminal when the prototype starts. If
// something is not where this expects, you will see it there rather than
// discovering it three screens into a journey.
//
const fs = require('fs')
const path = require('path')

const VIEWS_ROOT = path.join(__dirname, 'views')

const viewsByName = {}
const duplicateViews = []

function indexViews (dir) {
  let entries

  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch (e) {
    return
  }

  entries.forEach(function (entry) {
    const full = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') { return }
      return indexViews(full)
    }

    if (!entry.name.toLowerCase().endsWith('.html')) { return }

    const key = entry.name.toLowerCase()
    // Forward slashes even on Windows - this becomes a template path.
    const relative = path.relative(VIEWS_ROOT, full).split(path.sep).join('/')

    if (viewsByName[key]) {
      duplicateViews.push(key + ': ' + viewsByName[key] + ' and ' + relative)
    } else {
      viewsByName[key] = relative
    }
  })
}

indexViews(VIEWS_ROOT)

// The template path for a file, wherever it turned out to be.
function viewFor (fileName) {
  return viewsByName[fileName.toLowerCase()] || null
}

// Every page whose Continue is a link pretending to be a submit button.
//
// govukButton renders an <a> whenever href is present, so a call carrying both
// href and type: "submit" detaches the button from its form. That one bug has
// now turned up on five screens, and it is invisible until you click. This
// finds the rest of them at startup so they can be listed on /whats-wired.
const brokenButtons = []

Object.keys(viewsByName).forEach(function (name) {
  let text

  try {
    text = fs.readFileSync(path.join(VIEWS_ROOT, viewsByName[name]), 'utf8')
  } catch (e) {
    return
  }

  const calls = text.match(/govukButton\(\{[\s\S]*?\}\)/g) || []

  calls.forEach(function (call) {
    if (/\bhref\s*:/.test(call) && /type\s*:\s*["']submit["']/.test(call)) {
      const label = (call.match(/text\s*:\s*["']([^"']+)["']/) || [])[1] || 'a button'
      brokenButtons.push({ view: viewsByName[name], label: label })
    }
  })
})

// The first of these filenames that exists. Pages in this prototype are
// spelled both ways - selectbenefit.html and select-benefit.html - so asking
// for one name only is another way to miss the file that is actually there.
function anyView (names) {
  for (let i = 0; i < names.length; i++) {
    const view = viewFor(names[i])
    if (view) { return view }
  }
  return null
}

const a14Views = {
  '/a14': anyView(['a14.html']),
  '/a14isjsa': anyView(['a14isjsa.html', 'a14-isjsa.html', 'a14isjsa.html']),
  '/a14esa': anyView(['a14esa.html', 'a14-esa.html'])
}

// ---------------------------------------------------------------------------
// Sending every route into an A14 form to the right one
// ---------------------------------------------------------------------------
//
// Chasing individual Continue buttons was not working. There are links into
// the A14 forms from several pages - /A14/newform, /a14forms, case overviews -
// and each one carries its own hard-coded address written before the fork
// existed. Fixing them one at a time means finding all of them first, and
// missing one puts you back on the wrong form with no clue why.
//
// So this does not care which link was followed. Any address whose last part
// is a14, a14isjsa or a14esa is a request for "the A14 form", and if the
// benefit on the case says a different one, it goes there instead. That covers
// /a14, /A14/a14, /a14/a14isjsa and anything else pointing at a form, whatever
// folder it names.
//
// It deliberately does not match /a14forms, /a14caseoverview, /a14PDF or
// /A14/newform - those are pages in their own right, not the form itself.
//
const a14Addresses = {
  a14: '/a14',
  a14isjsa: '/a14isjsa',
  a14esa: '/a14esa'
}

// The last part of a path, without any .html, lower case - so "/A14/a14.html"
// and "/a14" both come out as "a14". macOS treats file paths as case
// insensitive, so links in the prototype use both /A14/ and /a14/.
function lastSegment (path) {
  const parts = String(path || '').split('/').filter(Boolean)
  const last = parts.length ? parts[parts.length - 1] : ''
  return last.replace(/\.html$/i, '').toLowerCase()
}

// Pages that should work from any address, so moving the file between folders
// or spelling a link differently stops mattering. newform.html sitting at the
// root rather than in /A14 is exactly the case that broke this: every link
// saying /A14/newform stopped resolving the moment it moved.
const BENEFIT_DETAILS_FILES = [
  'benefits-details.html', 'benefit-details.html',
  'benefitsdetails.html', 'benefitdetails.html'
]

const SELECT_BENEFIT_FILES = ['select-benefit.html', 'selectbenefit.html']

const portablePages = {
  newform: anyView(['newform.html', 'new-form.html']),
  'new-form': anyView(['newform.html', 'new-form.html']),
  selectbenefit: anyView(SELECT_BENEFIT_FILES),
  'select-benefit': anyView(SELECT_BENEFIT_FILES),
  benefitsdetails: anyView(BENEFIT_DETAILS_FILES),
  benefitdetails: anyView(BENEFIT_DETAILS_FILES),
  'benefit-details': anyView(BENEFIT_DETAILS_FILES),
  'benefits-details': anyView(BENEFIT_DETAILS_FILES)
}

// Every QB16 page, wherever you put the folder. This is why nothing in those
// templates names the folder: /qb16listofentries resolves to the file called
// qb16listofentries.html no matter where it is, so moving QB16entrydetails
// somewhere else breaks nothing.
Object.keys(viewsByName).forEach(function (name) {
  if (/^(qb16|viewqb16|dcc)/i.test(name)) {
    portablePages[name.replace(/\.html$/i, '')] = viewsByName[name]
  }
})

// The A14 pages that are not one of the three forms - a14forms,
// a14caseprintselection and so on. The three forms themselves are deliberately
// left out: they are answered further up by the benefit fork, and putting them
// here would let /a14esa serve the ESA form whatever benefit the case is for,
// which is the bug that took a day to find the first time.
//
// a14-tables.html is a macro rather than a page, so it is skipped too.
const A14_FORM_FILES = ['a14.html', 'a14esa.html', 'a14isjsa.html', 'a14-tables.html']

Object.keys(viewsByName).forEach(function (name) {
  if (/^a14/i.test(name) && A14_FORM_FILES.indexOf(name) === -1) {
    portablePages[name.replace(/\.html$/i, '')] = viewsByName[name]
  }
})

// One place that answers every request for a page whose location should not
// matter. Because it works off the last part of the address, lower cased and
// without any .html, all of these reach the same file:
//
//   /newform   /NewForm   /A14/newform   /a14/newform.html
//
// Registered before anything else so it answers first. Express matches in
// declaration order, and a route declared earlier would win - that is what
// made /a14esa keep serving the ESA form whichever benefit was chosen.
router.use(function (req, res, next) {
  if (req.method !== 'GET') { return next() }

  const segment = lastSegment(req.path)
  const data = (req.session && req.session.data) || {}

  // The success banner belongs to the visit that follows the action.
  //
  // The previous version cleared it on any request that was not the overview,
  // which included the browser's own requests for stylesheets, scripts and
  // favicons. Depending on the order those arrive in, the banner could be gone
  // before the page it belongs to had rendered.
  //
  // So: requests for a file are ignored entirely, the overview keeps the
  // banner for exactly one visit, and going anywhere else clears it.
  if (data.caseBanner && !/\.[a-z0-9]+$/i.test(req.path)) {
    if (segment === lastSegment(CASE_OVERVIEW_PAGE)) {
      if (data.caseBannerSeen) {
        delete data.caseBanner
        delete data.caseBannerSeen
      } else {
        data.caseBannerSeen = 'yes'
      }
    } else {
      delete data.caseBanner
      delete data.caseBannerSeen
    }
  }

  // Opening a "New something" sub-page. Remember which one, so that when it
  // posts to /return-to-tab the answers go into the right table - and where it
  // lives, so an Edit link can reopen this same page later.
  const openedType = rowTypeFor(segment)

  if (openedType) {
    data.a14SubPage = segment
    data.a14SubPagePath = req.path

    // Arriving without edit markers means this is a fresh "New", so clear the
    // fields the last entry left behind and start with an empty form.
    // Anything another page also relies on is left alone.
    if (!data.a14EditKey) {
      snapshotShared(data)

      const previous = (data[openedType.key] || [])[0]

      if (previous) {
        Object.keys(previous).forEach(function (field) {
          if (field.charAt(0) === '_') { return }
          if (sharedFields.indexOf(field) > -1) { return }
          delete data[field]
        })
      }
    }
  }

  // ----- An A14 form: open the one the benefit says, not the one linked -----
  if (a14Addresses[segment]) {
    const record = benefits[data.benefit]

    // Nothing stored. Showing a form anyway is what made this look broken -
    // one of the three appears and there is no way to tell it was a fallback
    // rather than a choice. Go back and ask instead.
    if (!record || !record.a14) {
      data.benefitError = 'Select which benefit this case is for before opening an A14 form'
      return res.redirect(SELECT_BENEFIT_PAGE)
    }

    // Asked for the wrong form - send them to the right one, at its real
    // address, so the address bar says which form they are on.
    if (record.a14 !== a14Addresses[segment]) {
      return res.redirect(realAddress(record.a14))
    }

    const wanted = a14Views[record.a14]

    if (!wanted) { return next() }

    return res.render(wanted, function (err, html) {
      if (err) { return next() }
      res.send(html)
    })
  }

  // ----- A page that should work from anywhere -----
  if (portablePages[segment]) {
    return res.render(portablePages[segment], function (err, html) {
      if (err) { return next() }
      res.send(html)
    })
  }

  next()
})

// ---------------------------------------------------------------------------
// What is actually stored - visit /whats-stored
// ---------------------------------------------------------------------------
//
// A plain page, built here rather than from a template so it cannot fail for
// the same reason anything else might. Two things it settles in one look:
//
//   - if it 404s, app/routes.js is not loading at all, and none of the
//     branching in this file is running. Check the terminal for an error, and
//     check there is only one routes.js.
//   - if it loads and Benefit is empty, the page asking the question is not
//     posting, so there is nothing for the fork to read.
//
router.get('/whats-stored', function (req, res) {
  const data = (req.session && req.session.data) || {}
  const record = benefits[data.benefit]

  function row (label, value) {
    return '<tr class="govuk-table__row">' +
      '<th scope="row" class="govuk-table__header">' + label + '</th>' +
      '<td class="govuk-table__cell">' + (value || '<em>not set</em>') + '</td></tr>'
  }

  res.send('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    '<title>What is stored - OpCalc</title>' +
    '<link rel="stylesheet" href="/govuk/govuk-frontend.min.css"></head>' +
    '<body class="govuk-template__body"><div class="govuk-width-container">' +
    '<main class="govuk-main-wrapper">' +
    '<h1 class="govuk-heading-l">What is stored against this case</h1>' +
    '<p class="govuk-body">app/routes.js is loading. If this page shows at all, the branching code is running.</p>' +
    '<table class="govuk-table"><tbody class="govuk-table__body">' +
    row('Benefit code', data.benefit) +
    row('Benefit name', data.benefitLabel) +
    row('A14 form it opens', record && record.a14 ? realAddress(record.a14) : null) +
    row('Initial benefit week', data.initialBenefitWeek) +
    row('Benefit week type', data.benefitWeekType) +
    '</tbody></table>' +
    (data.benefit
      ? '<p class="govuk-body">The benefit is stored. Any link to an A14 form should now open <strong>' +
        (record && record.a14 ? record.a14 : 'nothing - this benefit has no form') + '</strong>.</p>'
      : '<p class="govuk-body">Nothing is stored. The page asking which benefit is not posting its answer - ' +
        'its Continue is most likely a link rather than a submit button.</p>') +
    '<p class="govuk-body"><a class="govuk-link" href="' + SELECT_BENEFIT_PAGE + '">Choose a benefit</a>' +
    ' &nbsp; <a class="govuk-link" href="/clear-benefit">Clear the benefit and start again</a></p>' +

    // Where the journey resolved to. Screenshot this rather than describing it.
    '<h2 class="govuk-heading-m">Where the journey points</h2>' +
    '<table class="govuk-table"><tbody class="govuk-table__body">' +
    row('Select benefit', SELECT_BENEFIT_PAGE) +
    row('Benefit details', BENEFIT_DETAILS_PAGE) +
    row('Check your answers', CHECK_ANSWERS_PAGE) +
    row('New A14 form', NEW_FORM_PAGE) +
    '</tbody></table>' +

    '<h2 class="govuk-heading-m">A14 forms found</h2>' +
    '<table class="govuk-table"><tbody class="govuk-table__body">' +
    Object.keys(a14Views).map(function (address) {
      return row(address, a14Views[address] ||
        '<strong class="govuk-tag govuk-tag--red">NOT FOUND</strong> - no file of that name under app/views')
    }).join('') +
    '</tbody></table>' +

    // The recurring bug, listed for the whole prototype rather than found one
    // screen at a time.
    '<h2 class="govuk-heading-m">Buttons that will not submit</h2>' +
    (brokenButtons.length
      ? '<p class="govuk-body">These are govukButton calls carrying both an href and type: "submit". ' +
        'govukButton renders a link when href is present, so each of these detaches from its form and ' +
        'silently does nothing.</p>' +
        '<table class="govuk-table"><tbody class="govuk-table__body">' +
        brokenButtons.map(function (b) { return row(b.view, b.label) }).join('') +
        '</tbody></table>'
      : '<p class="govuk-body">None found. Every submit button on every page is a real button.</p>') +

    '<h2 class="govuk-heading-m">Every page found</h2>' +
    '<p class="govuk-body">' + Object.keys(viewsByName).length + ' files under app/views.</p>' +
    '<table class="govuk-table"><tbody class="govuk-table__body">' +
    Object.keys(viewsByName).sort().map(function (name) {
      return row(viewsByName[name], '/' + viewsByName[name].replace(/\.html$/i, ''))
    }).join('') +
    '</tbody></table>' +

    '</main></div></body></html>')
})

// Same page, easier name to remember.
router.get('/whats-wired', function (req, res) { res.redirect('/whats-stored') })

// The benefit sits in the session until it is replaced, which is right for a
// case but confusing while testing - an old choice looks like a new one that
// did not take. This clears it without wiping the rest of the case.
router.get('/clear-benefit', function (req, res) {
  const data = req.session.data || {}

  delete data.benefit
  delete data.benefitLabel
  delete data.benefitError
  delete data.initialBenefitWeek
  delete data.benefitWeekType

  res.redirect(SELECT_BENEFIT_PAGE)
})

// The pages either side of the benefit questions. Each is the address the kit
// actually serves the file at, worked out from where the file turned out to
// be - so a redirect lands on the real page rather than on a path I guessed.
function addressOf (names, fallback) {
  const view = anyView(names)
  return view ? '/' + view.replace(/\.html$/i, '') : fallback
}

// ---------------------------------------------------------------------------
// Addresses you can set by hand
// ---------------------------------------------------------------------------
//
// Normally routes.js works these out by finding the files under app/views, so
// moving a page does not break anything. If it ever gets one wrong, put the
// address you want here and it wins - no other change needed.
//
// Copy the address exactly as it appears in your browser's address bar, for
// example '/customer-details/benefit-details'. Leave it as '' to let routes.js
// work it out.
//
// Whichever is used, the startup message in your terminal says which.
//
const ADDRESSES = {
  selectBenefit: '',
  benefitDetails: '',
  checkAnswers: '',
  newForm: '',
  caseOverview: ''
}

const SELECT_BENEFIT_PAGE = ADDRESSES.selectBenefit || addressOf(SELECT_BENEFIT_FILES, '/select-benefit')
const BENEFIT_DETAILS_PAGE = ADDRESSES.benefitDetails || addressOf(BENEFIT_DETAILS_FILES, '/benefit-details')
const CHECK_ANSWERS_PAGE = ADDRESSES.checkAnswers || addressOf(['check-your-answers.html', 'checkyouranswers.html'], '/check-your-answers')
const NEW_FORM_PAGE = ADDRESSES.newForm || addressOf(['newform.html', 'new-form.html'], '/newform')
const CASE_OVERVIEW_PAGE = ADDRESSES.caseOverview || addressOf(['case-overview.html', 'caseoverview.html'], '/onboarding/case-overview')

// Printed once when the prototype starts, so where everything resolved to is
// visible in the terminal instead of being guessed at.
console.log('')
console.log('OpCalc - benefit journey')
function how (override, files) {
  if (override) { return '  (set by hand in ADDRESSES)' }
  return anyView(files) ? '' : '  <- NOT FOUND, this is a guess. Set it in ADDRESSES near the top of this file.'
}

console.log('  select benefit   ' + SELECT_BENEFIT_PAGE + how(ADDRESSES.selectBenefit, SELECT_BENEFIT_FILES))
console.log('  benefit details  ' + BENEFIT_DETAILS_PAGE + how(ADDRESSES.benefitDetails, BENEFIT_DETAILS_FILES))
console.log('  check answers    ' + CHECK_ANSWERS_PAGE + how(ADDRESSES.checkAnswers, ['check-your-answers.html', 'checkyouranswers.html']))
console.log('  new A14 form     ' + NEW_FORM_PAGE + how(ADDRESSES.newForm, ['newform.html', 'new-form.html']))
console.log('  case overview    ' + CASE_OVERVIEW_PAGE + how(ADDRESSES.caseOverview, ['case-overview.html', 'caseoverview.html']))
console.log('  A14 forms:')

Object.keys(a14Views).forEach(function (address) {
  console.log('    ' + address.padEnd(12) + (a14Views[address] || 'NOT FOUND - check the filename'))
})

if (duplicateViews.length) {
  console.log('  Two files share a name, so the first is used:')
  duplicateViews.forEach(function (line) { console.log('    ' + line) })
}

console.log('')

// Opens the A14 form for the benefit stored against the case.
//
// There is deliberately no fallback. The old /newform sent anything it did not
// recognise to /a14, which meant a case with no benefit chosen looked like it
// had chosen IS/PC. Sending them back to pick one makes the gap visible
// instead of quietly picking the wrong form.
// The address a form really lives at, worked out from where the file is -
// so the IS/PC form in A14pcispc lands on /A14pcispc/a14 rather than /a14.
function realAddress (canonical) {
  const view = a14Views[canonical]
  return view ? '/' + view.replace(/\.html$/i, '') : canonical
}

function openA14 (req, res) {
  const record = benefits[req.session.data.benefit]

  if (!record || !record.a14) {
    req.session.data.benefitError = 'Select which benefit this case is for before opening an A14 form'
    return res.redirect(SELECT_BENEFIT_PAGE)
  }

  res.redirect(realAddress(record.a14))
}

// ---------------------------------------------------------------------------
// Choosing the benefit
// ---------------------------------------------------------------------------
//
// Nothing is stored unless a real, selectable benefit came through. Posting a
// disabled value by hand is caught here as well, so the greying out on the
// page is not the only thing holding it.
//
function selectBenefitContinue (req, res) {
  const data = req.session.data
  const chosen = req.body.benefit

  if (!chosen) {
    data.benefitError = 'Select which benefit this case is for'
    return res.redirect(SELECT_BENEFIT_PAGE)
  }

  if (!benefits[chosen] || !benefits[chosen].available) {
    data.benefitError = 'That benefit is not part of this prototype. Select Employment and Support Allowance, Income Support/Jobseeker’s Allowance, or Income Support/Pension Credit.'
    return res.redirect(SELECT_BENEFIT_PAGE)
  }

  data.benefit = chosen
  data.benefitLabel = benefits[chosen].label

  // The benefit sets the benefit week, so offer it as the starting point on
  // the next page rather than making someone look it up. Only when it has not
  // already been set, so going back and changing the benefit does not throw
  // away a deliberate choice.
  if (!data.initialBenefitWeek) {
    data.initialBenefitWeek = benefits[chosen].benefitWeek
  }
  if (!data.benefitWeekType) {
    data.benefitWeekType = benefits[chosen].weekType
  }

  delete data.benefitError

  res.redirect(BENEFIT_DETAILS_PAGE)
}

router.post('/select-benefit-continue', selectBenefitContinue)

// ---------------------------------------------------------------------------
// Benefit details - the discrepancy period and benefit week
// ---------------------------------------------------------------------------

function benefitDetailsContinue (req, res) {
  const data = req.session.data
  const body = req.body
  const errors = []

  function fail (field, href, message) {
    if (message) {
      errors.push({ field: field, href: href, message: message })
    }
  }

  fail('discrepancy-from', '#discrepancy-from-day',
    checkDate(body, 'discrepancyFrom', 'the date the discrepancy period started'))
  fail('discrepancy-to', '#discrepancy-to-day',
    checkDate(body, 'discrepancyTo', 'the date the discrepancy period ended'))

  // Only worth comparing once both are real dates.
  if (!errors.length) {
    const from = dateValue(dateParts(body, 'discrepancyFrom'))
    const to = dateValue(dateParts(body, 'discrepancyTo'))

    if (from && to && to < from) {
      fail('discrepancy-to', '#discrepancy-to-day',
        'The date the discrepancy period ended must be the same as or after the date it started')
    }
  }

  if (!body.initialBenefitWeek) {
    fail('initial-benefit-week', '#initial-benefit-week', 'Select an initial benefit week')
  }

  if (!body.benefitWeekType) {
    fail('benefit-week-type', '#benefit-week-type', 'Select a benefit week type')
  }

  if (errors.length) {
    data.benefitDetailsErrors = errors
    return res.redirect(BENEFIT_DETAILS_PAGE)
  }

  delete data.benefitDetailsErrors

  res.redirect(CHECK_ANSWERS_PAGE)
}

router.post('/benefit-details-continue', benefitDetailsContinue)

// ---------------------------------------------------------------------------
// A14 forms - which form to open depends on the benefit type
// ---------------------------------------------------------------------------
//
// This is where the fork actually happens. The benefit was chosen back on
// /select-benefit and has been sitting in the session ever since; Continue on
// /A14/newform reads it and opens the matching form.
//
// Two addresses for the same thing, because the Continue button on that page
// may be either a submit inside a form or a plain link:
//
//   a submit button -> <form action="/newform" method="post">
//   a link          -> href="/newform-continue"
//
// Use whichever matches the page. Both end up in openA14.
//
// Continue on the new A14 form page.
//
// The start date is checked, but it never blocks the fork. Making it mandatory
// was a mistake: leave the date empty - or arrive without having filled in the
// discrepancy period, so there is nothing to prefill it from - and Continue
// stopped dead with an error instead of opening a form. The fork is the point
// of this page; a date that has not been typed yet is not a reason to refuse.
//
// So an empty date is allowed through, and a date that was typed is only
// rejected when it is genuinely impossible - not a real date, or outside the
// discrepancy period.
function newFormContinue (req, res) {
  const data = req.session.data || {}
  const body = req.body || {}
  const errors = []

  function fail (href, message) {
    if (message) { errors.push({ href: href, message: message }) }
  }

  const given = anyGiven(body, ['a14StartDate-day', 'a14StartDate-month', 'a14StartDate-year'])

  if (given) {
    fail('#a14-start-date-day', checkDate(body, 'a14StartDate', 'the start date'))

    // The hint on the page states the rule: the form can start later than the
    // discrepancy period but never earlier, and there is nothing to calculate
    // after the period ends.
    if (!errors.length) {
      const start = dateValue(dateParts(body, 'a14StartDate'))
      const from = dateValue(dateParts(data, 'discrepancyFrom'))
      const to = dateValue(dateParts(data, 'discrepancyTo'))

      if (from && start < from) {
        fail('#a14-start-date-day',
          'The start date cannot be earlier than ' + dateFrom(data, 'discrepancyFrom') +
          ', the start of the discrepancy period. Cancel and amend that date instead.')
      }

      if (to && start > to) {
        fail('#a14-start-date-day',
          'The start date cannot be later than ' + dateFrom(data, 'discrepancyTo') +
          ', the end of the discrepancy period')
      }
    }
  }

  if (errors.length) {
    data.newFormErrors = errors
    return res.redirect(NEW_FORM_PAGE)
  }

  delete data.newFormErrors

  openA14(req, res)
}

router.post('/newform', newFormContinue)
router.get('/newform-continue', openA14)
router.post('/newform-continue', openA14)

// Posting works from any address too, for the same reason reading does.
// newform.html has now lived at the root and inside /A14, and a form action
// written for one of those is wrong in the other. Matching on the last part of
// the address means it no longer matters where the file sits.
const postHandlers = {
  a14caseoverview: generateA14,
  a14forms: generateA14,
  newform: newFormContinue,
  'new-form': newFormContinue,
  'newform-continue': openA14,
  'select-benefit-continue': selectBenefitContinue,
  'benefit-details-continue': benefitDetailsContinue,
  'benefits-details-continue': benefitDetailsContinue
}

router.use(function (req, res, next) {
  if (req.method !== 'POST') { return next() }

  const handler = postHandlers[lastSegment(req.path)]

  if (!handler) { return next() }

  handler(req, res)
})

// ---------------------------------------------------------------------------
// QB16
// ---------------------------------------------------------------------------

// Overlapping dates warning.
// Yes - dates get adjusted, so the entry is accepted.
// No  - go back to the entry so the dates can be changed.
// ---------------------------------------------------------------------------
// QB16 entry details
// ---------------------------------------------------------------------------

// Finishing the QB16. Same shape as generating the A14 forms: mark it done,
// set the banner, and go back to the one case overview.
router.post('/qb16-complete', function (req, res) {
  if (!req.session.data) { req.session.data = {} }
  const data = req.session.data

  data.qb16Complete = 'yes'
  data.caseBanner = 'qb16'
  delete data.caseBannerSeen

  console.log('QB16: calculation run, redirecting to ' + CASE_OVERVIEW_PAGE)

  res.redirect(CASE_OVERVIEW_PAGE)
})

// The old page that stood in for the case overview once a QB16 was filled in.
// There is one case overview now, and it shows the QB16 row itself, so both
// addresses go there.
router.get('/landingpagewithqb16entrydetailsfilledin', function (req, res) { res.redirect(CASE_OVERVIEW_PAGE) })
router.post('/landingpagewithqb16entrydetailsfilledin', function (req, res) {
  if (!req.session.data) { req.session.data = {} }
  req.session.data.qb16Complete = 'yes'
  req.session.data.caseBanner = 'qb16'
  res.redirect(CASE_OVERVIEW_PAGE)
})

// Printing. The selection itself does not need keeping in a prototype - what
// matters is that pressing the button confirms something happened.
router.post('/qb16-print', function (req, res) {
  if (!req.session.data) { req.session.data = {} }
  req.session.data.caseBanner = 'printed'
  delete req.session.data.caseBannerSeen

  res.redirect(CASE_OVERVIEW_PAGE)
})

// Insert standard text. It posts here rather than to /return-to-tab because
// it is not a row - it fills in the Cause box on the list of entries.
router.post('/qb16-standard-text', function (req, res) {
  const data = req.session.data || {}
  const destination = req.body.returnTo || data.returnTo || '/qb16listofentries#list-of-entries'

  // Whatever was chosen goes into the Cause box, replacing anything typed
  // there before - which is what "insert standard text" means here.
  if (req.body.standardText) {
    data.cause = req.body.standardText
  }

  delete data.returnTo

  res.redirect(destination)
})

// The Yes/No branch on the overlapping dates warning.
//
//   Yes -> the dates get adjusted, so the entry is accepted and you go back
//          to the list of entries
//   No  -> you go back to the entry to change the dates yourself
router.post('/qb16-overlap-answer', function (req, res) {
  const adjustDates = req.body.adjustDates || (req.session.data || {}).adjustDates

  if (adjustDates === 'no') {
    res.redirect('/qb16entrydetails?returnTo=/qb16listofentries%23list-of-entries')
  } else {
    res.redirect('/qb16listofentries#list-of-entries')
  }
})

// Clear the cause box on the QB16 list of entries, so standard text that was
// inserted can be removed and started again. Both fields go, because the
// textarea shows whichever of the two is set.
router.get('/qb16-clear-cause', function (req, res) {
  const data = req.session.data || {}

  delete data.cause
  delete data.standardText

  res.redirect('/qb16listofentries#list-of-entries')
})

// Deleting a row, confirmed from one of the three QB16 delete pages.
//
// Which row is on the address of the confirmation page, which the Prototype
// Kit stores into the session for us - so by the time Yes is pressed, the
// table and the row number are already here.
router.post('/qb16-delete-row', function (req, res) {
  const data = req.session.data || {}
  const key = data.deleteKey
  const index = parseInt(data.deleteIndex, 10)
  const destination = data.deleteReturnTo || '/qb16listofentries'

  if (key && Array.isArray(data[key]) && !isNaN(index)) {
    data[key].splice(index, 1)
  }

  delete data.deleteKey
  delete data.deleteIndex
  delete data.deleteReturnTo

  res.redirect(destination)
})

// ---------------------------------------------------------------------------
// DCC - Income Support / Jobseeker's Allowance
// ---------------------------------------------------------------------------

// The tabs page has several submit buttons in one form. The 'action' value
// says which was pressed, and each Add returns to the tab it came from.
// The DCC tabs page has several submit buttons in one form - an Add button on
// four of the tabs, plus Run the calculation. They all post here, and the
// 'action' value says which one was pressed.
//
// Each Add files the answer into the table for that tab and clears the boxes
// it used, so the form is empty and ready for the next one - which is what
// makes the table hold more than a single row.
//
// fields lists exactly what belongs to that tab. It was a single prefix at
// first, which broke as soon as PC/ISPC arrived: "Income from capital" sits on
// the rates tab and is called pcispcIncomeFromCapital, so a pcispcIncome
// prefix would drag it into the income table. Naming the fields is duller and
// correct.
//
// A date input's three boxes are matched by their prefix, so listing
// pcispcRateDate covers -day, -month and -year.
const dccAddActions = {
  'add-rate': { key: 'Rates', tab: 'isjsa-paid', fields: ['isjsaRateDate', 'isjsaRateAmount', 'isjsaRateTaxable', 'isjsaRatePersonalAllowance'] },
  'add-income': { key: 'Income', tab: 'income', fields: ['isjsaIncomeDate', 'isjsaIncomeAmount', 'isjsaIncomePaymentPeriod', 'isjsaIncomeDisregard', 'isjsaIncomeDescription'] },
  'add-tariff': { key: 'Tariff', tab: 'tariff-income', fields: ['isjsaTariffDate', 'isjsaTariffAmount'] },
  'add-rescare': { key: 'ResCare', tab: 'res-care-pens', fields: ['isjsaResCareFrom', 'isjsaResCareTo', 'isjsaResCareType'] }
}

// True when a posted field belongs to this Add - an exact match, or one of the
// three boxes of a date input.
function belongsTo (field, names) {
  return names.some(function (name) {
    return field === name || field.indexOf(name + '-') === 0
  })
}

function dccAdd (req, res, page, variant, actions) {
  if (!req.session.data) { req.session.data = {} }

  const data = req.session.data
  const action = req.body.action || data.action
  const add = (actions || dccAddActions)[action]

  if (!add) { return false }

  const key = 'dcc' + variant + add.key
  const row = {}

  Object.keys(req.body).forEach(function (field) {
    if (belongsTo(field, add.fields)) { row[field] = req.body[field] }
  })

  const filled = Object.keys(row).some(function (field) {
    return String(row[field] === undefined ? '' : row[field]).trim() !== ''
  })

  if (filled) {
    // Dates arrive as three fields. buildRow also joins each set into one
    // dd/mm/yyyy value, so the table can show a date without reassembling it.
    data[key] = data[key] || []
    data[key].push(buildRow(row))
  }

  // Empty the boxes that were just used, so the next entry starts blank
  // rather than repeating the last one.
  Object.keys(data).forEach(function (field) {
    if (belongsTo(field, add.fields)) { delete data[field] }
  })

  delete data.action

  res.redirect(page + '#' + add.tab)

  // Says the request has been answered. res.redirect returns nothing, so
  // returning it here would read as "not handled" and the caller would carry
  // on into Run the calculation - marking the DCC done every time an Add was
  // pressed, and answering the same request twice.
  return true
}

router.post('/dccisjsa-action', function (req, res) {
  const added = dccAdd(req, res, '/dccisjsa', 'Isjsa')
  if (added) { return }

  // Run the calculation. Same shape as the A14 forms and the QB16: mark it
  // done, set the banner, and go back to the one case overview.
  if (!req.session.data) { req.session.data = {} }
  const data = req.session.data

  data.dccComplete = 'yes'
  data.caseBanner = 'dcc'
  delete data.caseBannerSeen
  delete data.action

  console.log('DCC (IS/JSA): calculation run, redirecting to ' + CASE_OVERVIEW_PAGE)

  res.redirect(CASE_OVERVIEW_PAGE)
})

// Asset page: choosing Yes or No to "Is this an accumulating asset?" swaps
// which set of fields you get.
router.post('/dccisjsa-asset-accumulating', function (req, res) {
  const accumulating = req.body.isjsaAccumulatingAsset || (req.session.data || {}).isjsaAccumulatingAsset

  if (accumulating === 'yes') {
    res.redirect('/dccisjsaassetsnewassetaccumulatingassetyes')
  } else {
    res.redirect('/dccisjsaassetsnewassetaccumulatingassetno')
  }
})

// Asset value page. In the real system the "already exists" warning only fires
// when the date matches a value already recorded against that asset - a
// prototype cannot work that out, so it always fires.
//
// The value is held here rather than saved, because the next screen offers the
// chance to change the date instead. It is only written to the table if the
// answer is yes.
router.post('/dccisjsa-asset-value', function (req, res) {
  if (!req.session.data) { req.session.data = {} }

  req.session.data.dccPendingValue = buildRow(req.body)

  res.redirect('/dccisjsaassetstickshowvaluesalreadyexists')
})

// Already exists warning: Yes keeps the value, No goes back to change the date.
router.post('/dccisjsa-value-replace', function (req, res) {
  if (!req.session.data) { req.session.data = {} }

  const data = req.session.data
  const replace = req.body.isjsaReplaceValue || data.isjsaReplaceValue

  if (replace === 'no') {
    return res.redirect('/dccisjsaassetstickshowvalues')
  }

  if (data.dccPendingValue) {
    data.dccIsjsaAssetValues = data.dccIsjsaAssetValues || []
    data.dccIsjsaAssetValues.push(data.dccPendingValue)
  }

  delete data.dccPendingValue
  delete data.isjsaReplaceValue

  res.redirect('/dccisjsa#assets')
})

// The ESA path had its own case overview and its own print page. There is one
// case overview now and it shows the DCC row itself, so that address goes
// there rather than showing the same case twice, disagreeing.
router.get('/dccesacaseoverview', function (req, res) { res.redirect(CASE_OVERVIEW_PAGE) })
router.post('/dccesacaseoverview', function (req, res) { res.redirect(CASE_OVERVIEW_PAGE) })

// Printing, from any of the print selection pages. The selection itself does
// not need keeping in a prototype - what matters is that pressing the button
// confirms something happened.
router.post('/case-print', function (req, res) {
  if (!req.session.data) { req.session.data = {} }

  req.session.data.caseBanner = 'printed'
  delete req.session.data.caseBannerSeen

  res.redirect(CASE_OVERVIEW_PAGE)
})

// Looking at a finished DCC. ESA has its own results page; the other two use
// the printed view until they get one.
const dccViewPages = {
  ESA: '/dccesaviewcaseoverview',
  'IS-PC': '/dccpcispcviewcaseoverview',
  PC: '/dccpcispcviewcaseoverview'
}

router.get('/dcc-view', function (req, res) {
  const data = req.session.data || {}
  res.redirect(dccViewPages[data.benefit] || '/dccPDF')
})

// The Diminishing capital calculation button on the case overview. Which DCC
// page you get depends on the benefit chosen for the case, the same way the
// A14 forms fork.
const dccPages = {
  'IS-JSA': '/dccisjsa',
  IS: '/dccisjsa',
  JSA: '/dccisjsa',
  'IS-PC': '/dccpcispc',
  PC: '/dccpcispc',
  ESA: '/dccesa'
}

router.get('/dcc', function (req, res) {
  const data = req.session.data || {}
  const page = dccPages[data.benefit]

  if (!page) {
    // No benefit chosen yet, so there is nothing to decide with.
    return res.redirect(SELECT_BENEFIT_PAGE)
  }

  res.redirect(page)
})

// ---------------------------------------------------------------------------
// DCC - Pension Credit / Income Support and Pension Credit
// ---------------------------------------------------------------------------

// The PC/ISPC tabs page, the same shape as IS/JSA. Each Add files the answer
// into the table for that tab and clears the boxes ready for the next one.
//
// The tab ids differ - the rates tab is "amount-paid" here, and there is no
// tariff tab - so this path gets its own map rather than sharing the IS/JSA
// one.
const dccPcispcAddActions = {
  'add-rate': {
    key: 'Rates',
    tab: 'amount-paid',
    fields: ['pcispcRateDate', 'pcispcSavingsCredit', 'pcispcClientGroup', 'pcispcApplicableAmount',
      'pcispcIncomeFromCapital', 'pcispcOtherQualifying', 'pcispcNonQualifying']
  },
  'add-income': {
    key: 'Income',
    tab: 'income',
    fields: ['pcispcIncomeStart', 'pcispcIncomeEnd', 'pcispcIncomeAmount', 'pcispcIncomePaymentPeriod',
      'pcispcIncomeDisregard', 'pcispcIncomeDescription', 'pcispcIncomeType']
  },
  'add-rescare': { key: 'ResCare', tab: 'res-care', fields: ['pcispcResCareFrom', 'pcispcResCareTo'] }
}

router.post('/dccpcispc-action', function (req, res) {
  const added = dccAdd(req, res, '/dccpcispc', 'Pcispc', dccPcispcAddActions)
  if (added) { return }

  // Run the calculation. Same shape as every other path: mark it done, set
  // the banner, and go back to the one case overview.
  if (!req.session.data) { req.session.data = {} }
  const data = req.session.data

  data.dccComplete = 'yes'
  data.caseBanner = 'dcc'
  delete data.caseBannerSeen
  delete data.action

  console.log('DCC (PC/IS-PC): calculation run, redirecting to ' + CASE_OVERVIEW_PAGE)

  res.redirect(CASE_OVERVIEW_PAGE)
})

// Asset page: Yes or No to "Is this an accumulating asset?" swaps which set
// of fields you get.
router.post('/dccpcispc-asset-accumulating', function (req, res) {
  const accumulating = req.body.pcispcAccumulatingAsset || (req.session.data || {}).pcispcAccumulatingAsset

  if (accumulating === 'yes') {
    res.redirect('/dccpcispcnewassetaccumulatingassetyes')
  } else {
    res.redirect('/dccpcispcnewassetaccumulatingassetno')
  }
})

// Asset value, through the "already exists" warning. The value is held rather
// than saved, because the next screen offers the chance to change the date
// instead - it is only written to the table if the answer is yes.
router.post('/dccpcispc-asset-value', function (req, res) {
  if (!req.session.data) { req.session.data = {} }

  req.session.data.dccPendingValue = buildRow(req.body)

  res.redirect('/dccpcispcassetvaluesalreadyexist')
})

router.post('/dccpcispc-value-replace', function (req, res) {
  if (!req.session.data) { req.session.data = {} }

  const data = req.session.data
  const replace = req.body.pcispcReplaceValue || data.pcispcReplaceValue

  if (replace === 'no') {
    return res.redirect('/dccpcispcassetsshowvalues')
  }

  if (data.dccPendingValue) {
    data.dccPcispcAssetValues = data.dccPcispcAssetValues || []
    data.dccPcispcAssetValues.push(data.dccPendingValue)
  }

  delete data.dccPendingValue
  delete data.pcispcReplaceValue

  res.redirect('/dccpcispc#assets')
})

// The PC/ISPC path had its own case overview too. One case overview now.
router.get('/dccpcispccaseoverview', function (req, res) { res.redirect(CASE_OVERVIEW_PAGE) })
router.post('/dccpcispccaseoverview', function (req, res) { res.redirect(CASE_OVERVIEW_PAGE) })

// ===========================================================================
// DCC - Employment and Support Allowance
// ===========================================================================
//
// Each tab keeps its rows in an array, so a case can have as many as it needs:
//
//   data.esaAssets  = [ { type, name, shareHeld, shareTotal, accumulating,
//                         values: [ { date, amount } ] } ]
//   data.esaRates   = [ { date, dateParts, amount, taxable, taxableElements } ]
//   data.esaIncomes = [ { date, dateParts, amount, paymentPeriod, disregard,
//                         description } ]
//   data.esaTariffs = [ { date, dateParts, amount } ]
//   data.esaResCare = [ { from, fromParts, to, toParts, pensioner } ]
//
// The tables on /dccesa read those arrays and nothing else. That matters:
// the Prototype Kit copies every posted field into session data, so a value
// that failed validation is still sitting in data.esaIncomeAmount. Reading
// the raw fields is what made rejected entries appear in the table as though
// they had been accepted.
//

// ---------------------------------------------------------------------------
// The period this calculation covers
// ---------------------------------------------------------------------------
//
// Shown on the page as "DCC: 27/10/2008 to 16/07/2026". Every date recorded
// has to fall inside it - a payment outside the discrepancy period cannot
// affect the answer, so accepting one is always a keying mistake.
//
const DCC_FROM = new Date(2008, 9, 27)
const DCC_TO = new Date(2026, 6, 16)
const DCC_FROM_TEXT = '27 10 2008'
const DCC_TO_TEXT = '16 7 2026'

// The old system capped amounts at six figures. Anything above it is a
// mis-key, usually pence typed as pounds.
const MAX_AMOUNT = 999999.99

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------
//
// Each returns an error message, or null when the value is fine. Messages
// follow the GOV.UK style: say what to do, not what went wrong.
//

function capitalise (text) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// Whole numbers only, so "12a" and "1.5" are both rejected.
function isWholeNumber (value) {
  return /^\d+$/.test(String(value).trim())
}

// Money, so digits with an optional two decimal places. Commas, spaces and
// pound signs are stripped first, since people paste amounts in.
function parseAmount (value) {
  return String(value === undefined || value === null ? '' : value)
    .trim()
    .replace(/[£,\s]/g, '')
}

function checkAmount (value, label) {
  const amount = parseAmount(value)

  if (amount === '') {
    return 'Enter ' + label
  }
  if (/^-/.test(amount)) {
    return capitalise(label) + ' cannot be a negative number'
  }
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
    return capitalise(label) + ' must be an amount, like 16000 or 16000.50'
  }
  if (Number(amount) > MAX_AMOUNT) {
    return capitalise(label) + ' must be £999,999.99 or less'
  }
  return null
}

// An optional amount only has to be valid when something was typed.
function checkOptionalAmount (value, label) {
  if (parseAmount(value) === '') {
    return null
  }
  return checkAmount(value, label)
}

// Dates come in as three separate boxes, so each is checked, then the whole
// thing is checked for being a real date. 31 April and 29 February in a
// non-leap year are both rejected here.
function checkDate (body, prefix, label) {
  const day = String(body[prefix + '-day'] || '').trim()
  const month = String(body[prefix + '-month'] || '').trim()
  const year = String(body[prefix + '-year'] || '').trim()

  if (!day && !month && !year) {
    return 'Enter ' + label
  }

  const missing = []
  if (!day) { missing.push('day') }
  if (!month) { missing.push('month') }
  if (!year) { missing.push('year') }

  if (missing.length) {
    return capitalise(label) + ' must include a ' + missing.join(' and ')
  }

  if (!isWholeNumber(day) || !isWholeNumber(month) || !isWholeNumber(year)) {
    return capitalise(label) + ' must be numbers, like 27 10 2008'
  }

  if (year.length !== 4) {
    return 'Year must be 4 numbers, like 2008'
  }

  const d = Number(day)
  const m = Number(month)
  const y = Number(year)

  if (m < 1 || m > 12) {
    return 'Month must be a number between 1 and 12'
  }

  const daysInMonth = new Date(y, m, 0).getDate()

  if (d < 1 || d > daysInMonth) {
    return 'Day must be a number between 1 and ' + daysInMonth + ' for that month'
  }

  return null
}

// A real date that also falls inside the discrepancy period.
function checkDateInPeriod (body, prefix, label) {
  const error = checkDate(body, prefix, label)
  if (error) { return error }

  const value = dateValue(dateParts(body, prefix))

  if (value < DCC_FROM || value > DCC_TO) {
    return capitalise(label) + ' must be between ' + DCC_FROM_TEXT + ' and ' +
           DCC_TO_TEXT + ', the dates of this calculation'
  }

  return null
}

// True when a date is real and complete, so ranges can be compared.
function dateValue (parts) {
  if (!parts || !parts.year) { return null }
  return new Date(Number(parts.year), Number(parts.month) - 1, Number(parts.day))
}

// Builds a dd/mm/yyyy string from a date input's three fields. Padded, so
// 1/1/2010 and 01/01/2010 are not treated as two different dates.
function dateFrom (body, prefix) {
  function pad (value) {
    const text = String(value === undefined ? '' : value).trim()
    return text.length === 1 ? '0' + text : text
  }

  return pad(body[prefix + '-day']) + '/' +
         pad(body[prefix + '-month']) + '/' +
         String(body[prefix + '-year'] || '').trim()
}

// Keeps the three parts of a date as well as the formatted version, so an
// Edit link can put them back into the day, month and year boxes.
function dateParts (body, prefix) {
  return {
    day: body[prefix + '-day'] || '',
    month: body[prefix + '-month'] || '',
    year: body[prefix + '-year'] || ''
  }
}

// True when any of the named fields holds something. Used to spot a row that
// was started but never added.
function anyGiven (body, names) {
  return names.some(function (name) {
    return String(body[name] === undefined ? '' : body[name]).trim() !== ''
  })
}

// Adds a row, or updates one when an index came through from an Edit link.
function saveRow (data, key, index, row) {
  const rows = data[key] || []

  if (index !== undefined && index !== '') {
    rows[index] = row
  } else {
    rows.push(row)
  }

  data[key] = rows
}

// Clears the one-off fields behind an Add form, so the next entry starts
// empty. Only called after a successful save - when validation fails the
// fields stay put so the page can show what was typed.
function clearFields (data, names) {
  names.forEach(function (name) { delete data[name] })
}

const rateFields = [
  'esaRateDate-day', 'esaRateDate-month', 'esaRateDate-year',
  'esaRateAmount', 'esaRateTaxable', 'esaTaxableElements'
]

const incomeFields = [
  'esaIncomeDate-day', 'esaIncomeDate-month', 'esaIncomeDate-year',
  'esaIncomeAmount', 'esaIncomePaymentPeriod', 'esaIncomeDisregard',
  'esaIncomeDescription'
]

const tariffFields = [
  'esaTariffDate-day', 'esaTariffDate-month', 'esaTariffDate-year',
  'esaTariffAmount'
]

const resCareFields = [
  'esaResCareFrom-day', 'esaResCareFrom-month', 'esaResCareFrom-year',
  'esaResCareTo-day', 'esaResCareTo-month', 'esaResCareTo-year',
  'esaPensioner'
]

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

// Save an asset. With an assetIndex it updates that one, otherwise it adds a
// new one to the end of the list.
router.post('/dccesa-asset-save', function (req, res) {
  const data = req.session.data
  const body = req.body
  const assets = data.esaAssets || []
  const index = body.assetIndex
  const errors = []

  function fail (field, href, message) {
    if (message) {
      errors.push({ tab: 'assets', tabLabel: 'Assets', field: field, href: href, message: message })
    }
  }

  if (!body.esaAssetType) {
    fail('esa-asset-type', '#esa-asset-type', 'Select an asset type')
  }

  // The share is a fraction, so both numbers must be whole and the part held
  // cannot be bigger than the whole.
  if (!isWholeNumber(body.esaShareHeld)) {
    fail('esa-share-held', '#esa-share-held',
      'Share held by the customer must be a whole number, like 1')
  }

  if (!isWholeNumber(body.esaShareTotal) || Number(body.esaShareTotal) === 0) {
    fail('esa-share-total', '#esa-share-total',
      'Total shares must be a whole number above 0, like 2')
  }

  if (isWholeNumber(body.esaShareHeld) && isWholeNumber(body.esaShareTotal) &&
      Number(body.esaShareHeld) > Number(body.esaShareTotal)) {
    fail('esa-share-held', '#esa-share-held',
      'Share held by the customer cannot be more than the total shares')
  }

  // An accumulating asset needs its own dates and values.
  if (body.esaAccumulatingAsset === 'yes') {
    const startError = checkDateInPeriod(body, 'esaAccumulatingStart', 'the start date')
    const endError = checkDateInPeriod(body, 'esaAccumulatingEnd', 'the end date')

    fail('esa-accumulating-start', '#esa-accumulating-start-day', startError)
    fail('esa-accumulating-end', '#esa-accumulating-end-day', endError)

    if (!startError && !endError) {
      const from = dateValue(dateParts(body, 'esaAccumulatingStart'))
      const to = dateValue(dateParts(body, 'esaAccumulatingEnd'))

      if (from && to && to < from) {
        fail('esa-accumulating-end', '#esa-accumulating-end-day',
          'The end date must be the same as or after the start date')
      }
    }

    fail('esa-final-value', '#esa-final-value',
      checkAmount(body.esaFinalValue, 'the final value'))
  }

  if (errors.length) {
    data.dccErrors = errors
    return res.redirect('/dccesanewassetaccumulatingassetno' +
      (index !== undefined && index !== '' ? '?asset=' + index : ''))
  }

  const asset = {
    type: body.esaAssetType,
    name: body.esaAssetName || '',
    shareHeld: body.esaShareHeld,
    shareTotal: body.esaShareTotal,
    accumulating: body.esaAccumulatingAsset || 'no',
    values: []
  }

  if (index !== undefined && index !== '') {
    asset.values = (assets[index] || {}).values || []
    assets[index] = asset
  } else {
    assets.push(asset)
  }

  data.esaAssets = assets
  data.dccComplete = 'yes'

  clearFields(data, [
    'esaAssetType', 'esaAssetName', 'esaShareHeld', 'esaShareTotal',
    'esaAccumulatingAsset', 'esaFinalValue',
    'esaAccumulatingStart-day', 'esaAccumulatingStart-month', 'esaAccumulatingStart-year',
    'esaAccumulatingEnd-day', 'esaAccumulatingEnd-month', 'esaAccumulatingEnd-year',
    'asset'
  ])

  delete data.dccErrors

  res.redirect('/dccesa#assets')
})

// Delete an asset, confirmed from /dccesadeleteasset. Its values go with it.
router.post('/dccesa-asset-delete', function (req, res) {
  const data = req.session.data
  const index = req.body.assetIndex

  data.esaAssets = (data.esaAssets || []).filter(function (a, i) {
    return String(i) !== String(index)
  })

  delete data.asset

  res.redirect('/dccesa#assets')
})

// Save a value against an asset. If a value already exists for that date, go
// and ask whether to replace it rather than silently overwriting.
router.post('/dccesa-value-save', function (req, res) {
  const data = req.session.data
  const body = req.body
  const index = body.assetIndex
  const asset = (data.esaAssets || [])[index]
  const errors = []

  if (!asset) {
    return res.redirect('/dccesa#assets')
  }

  function fail (field, href, message) {
    if (message) {
      errors.push({ tab: 'assets', tabLabel: 'Assets', field: field, href: href, message: message })
    }
  }

  fail('esa-new-value-date', '#esa-new-value-date-day',
    checkDateInPeriod(body, 'esaNewValueDate', 'the date'))
  fail('esa-new-value', '#esa-new-value',
    checkAmount(body.esaNewValue, 'the value'))

  if (errors.length) {
    data.dccErrors = errors
    return res.redirect('/dccesaassetsshowvalues?asset=' + index + '&returnTo=/dccesa%23assets')
  }

  const date = dateFrom(body, 'esaNewValueDate')
  const clash = (asset.values || []).some(function (v) { return v.date === date })

  if (clash) {
    return res.redirect('/dccesaassetvaluesalreadyexist')
  }

  asset.values = asset.values || []
  asset.values.push({ date: date, amount: parseAmount(body.esaNewValue) })

  data.esaShowValues = 'showValues'

  clearFields(data, [
    'esaNewValueDate-day', 'esaNewValueDate-month', 'esaNewValueDate-year',
    'esaNewValue'
  ])

  delete data.dccErrors

  res.redirect('/dccesa#assets')
})

// Answer to the duplicate date warning.
// Yes - overwrite the value already held for that date.
// No  - go back to the asset value page to enter a different date.
router.post('/dccesa-value-replace', function (req, res) {
  const data = req.session.data
  const index = req.body.assetIndex
  const asset = (data.esaAssets || [])[index]

  if (req.body.esaReplaceValue === 'no' || !asset) {
    return res.redirect('/dccesaassetsshowvalues?asset=' + index + '&returnTo=/dccesa%23assets')
  }

  const date = data['esaNewValueDate-day'] + '/' +
               data['esaNewValueDate-month'] + '/' +
               data['esaNewValueDate-year']

  asset.values = (asset.values || []).map(function (v) {
    return v.date === date ? { date: date, amount: parseAmount(data.esaNewValue) } : v
  })

  data.esaShowValues = 'showValues'

  clearFields(data, [
    'esaNewValueDate-day', 'esaNewValueDate-month', 'esaNewValueDate-year',
    'esaNewValue'
  ])

  res.redirect('/dccesa#assets')
})

// ---------------------------------------------------------------------------
// Checks that only apply when the calculation is run
// ---------------------------------------------------------------------------
//
// Everything here is about the case as a whole rather than a single field, so
// it cannot be checked while a row is being added.
//
function dccEsaRunErrors (data, body) {
  const errors = []

  function fail (tab, tabLabel, field, href, message) {
    errors.push({ tab: tab, tabLabel: tabLabel, field: field, href: href, message: message })
  }

  // The calculation compares what was paid against what was due, so it needs
  // at least one rate and something to hold the capital.
  if (!data.esaRates || !data.esaRates.length) {
    fail('esa-paid', 'ESA Paid', 'esa-rate-date', '#esa-rate-date-day',
      'Add at least one rate before running the calculation')
  }

  if (!data.esaAssets || !data.esaAssets.length) {
    fail('assets', 'Assets', 'esa-assets', '#esa-assets-error',
      'Add at least one asset before running the calculation')
  }

  // An asset with no value has nothing to diminish.
  ;(data.esaAssets || []).forEach(function (asset) {
    if (!asset.values || !asset.values.length) {
      fail('assets', 'Assets', 'esa-assets', '#esa-assets-error',
        'Add at least one value to ' + (asset.name || asset.type))
    }
  })

  // A residential care period with no end date cannot be worked out.
  ;(data.esaResCare || []).forEach(function (period) {
    if (!period.toParts || !period.toParts.year) {
      fail('res-care', 'Res.Care', 'esa-res-care-to', '#esa-res-care-to-day',
        'Enter an end date for the residential care period starting ' + period.from)
    }
  })

  // Something half-typed into an Add form is not saved by Run. Say so, rather
  // than throwing it away.
  const started = [
    { fields: rateFields, tab: 'esa-paid', tabLabel: 'ESA Paid', field: 'esa-rate-date', href: '#esa-rate-date-day', name: 'a rate', button: 'Add rate' },
    { fields: incomeFields, tab: 'income', tabLabel: 'Income', field: 'esa-income-date', href: '#esa-income-date-day', name: 'an income entry', button: 'Add income' },
    { fields: tariffFields, tab: 'tariff-income', tabLabel: 'Tariff Income', field: 'esa-tariff-date', href: '#esa-tariff-date-day', name: 'a tariff income entry', button: 'Add tariff income' },
    { fields: resCareFields, tab: 'res-care', tabLabel: 'Res.Care', field: 'esa-res-care-from', href: '#esa-res-care-from-day', name: 'a residential care period', button: 'Add period' }
  ]

  started.forEach(function (group) {
    if (anyGiven(body, group.fields)) {
      fail(group.tab, group.tabLabel, group.field, group.href,
        'You have started ' + group.name + ' but not added it. Select ' +
        group.button + ', or clear the fields.')
    }
  })

  return errors
}

// ---------------------------------------------------------------------------
// One route for every submit button on the DCC ESA tabs
// ---------------------------------------------------------------------------
//
// The 'action' value says which was pressed. Nothing is saved unless it
// passes, and each Add returns to the tab it came from.
//
router.post('/dccesa-action', function (req, res) {
  const data = req.session.data
  const body = req.body
  const action = body.action
  const errors = []

  // Adds an error against a field, naming the tab so the page can point at it
  // and mark the tab label.
  function fail (tab, tabLabel, field, href, message) {
    if (message) {
      errors.push({ tab: tab, tabLabel: tabLabel, field: field, href: href, message: message })
    }
  }

  // ----- ESA Paid -----
  if (action === 'add-rate') {
    fail('esa-paid', 'ESA Paid', 'esa-rate-date', '#esa-rate-date-day',
      checkDateInPeriod(body, 'esaRateDate', 'the date this rate applies from'))
    fail('esa-paid', 'ESA Paid', 'esa-rate-amount', '#esa-rate-amount',
      checkAmount(body.esaRateAmount, 'the amount'))

    // Taxable elements is only needed when the rate is taxable, and is part
    // of the amount so it cannot be bigger than it.
    if (body.esaRateTaxable) {
      const taxableError = checkAmount(body.esaTaxableElements, 'the taxable elements')

      fail('esa-paid', 'ESA Paid', 'esa-taxable-elements', '#esa-taxable-elements', taxableError)

      if (!taxableError && !checkAmount(body.esaRateAmount, 'x') &&
          Number(parseAmount(body.esaTaxableElements)) > Number(parseAmount(body.esaRateAmount))) {
        fail('esa-paid', 'ESA Paid', 'esa-taxable-elements', '#esa-taxable-elements',
          'The taxable elements cannot be more than the amount')
      }
    }

    // Two rates from the same date would contradict each other.
    if (!errors.length) {
      const date = dateFrom(body, 'esaRateDate')
      const clash = (data.esaRates || []).some(function (rate, i) {
        return rate.date === date && String(i) !== String(body.editRateIndex)
      })

      if (clash) {
        fail('esa-paid', 'ESA Paid', 'esa-rate-date', '#esa-rate-date-day',
          'A rate has already been recorded for ' + date + '. Edit that rate, or use a different date.')
      }
    }

    if (errors.length) {
      data.dccErrors = errors
      return res.redirect('/dccesa#esa-paid')
    }

    saveRow(data, 'esaRates', body.editRateIndex, {
      date: dateFrom(body, 'esaRateDate'),
      dateParts: dateParts(body, 'esaRateDate'),
      amount: parseAmount(body.esaRateAmount),
      taxable: body.esaRateTaxable ? 'yes' : '',
      taxableElements: body.esaRateTaxable ? parseAmount(body.esaTaxableElements) : ''
    })

    clearFields(data, rateFields)
    delete data.editRate
    delete data.dccErrors
    return res.redirect('/dccesa#esa-paid')
  }

  // ----- Income -----
  if (action === 'add-income') {
    fail('income', 'Income', 'esa-income-date', '#esa-income-date-day',
      checkDateInPeriod(body, 'esaIncomeDate', 'the date this income applies from'))
    fail('income', 'Income', 'esa-income-amount', '#esa-income-amount',
      checkAmount(body.esaIncomeAmount, 'the amount'))

    if (!body.esaIncomePaymentPeriod) {
      fail('income', 'Income', 'esa-income-payment-period', '#esa-income-payment-period',
        'Select a payment period')
    }

    const disregardError = checkOptionalAmount(body.esaIncomeDisregard, 'the weekly disregard')
    fail('income', 'Income', 'esa-income-disregard', '#esa-income-disregard', disregardError)

    // A disregard bigger than the income itself would give a negative figure.
    if (!disregardError && parseAmount(body.esaIncomeDisregard) !== '' &&
        !checkAmount(body.esaIncomeAmount, 'x') &&
        Number(parseAmount(body.esaIncomeDisregard)) > Number(parseAmount(body.esaIncomeAmount))) {
      fail('income', 'Income', 'esa-income-disregard', '#esa-income-disregard',
        'The weekly disregard cannot be more than the amount')
    }

    if (String(body.esaIncomeDescription || '').length > 100) {
      fail('income', 'Income', 'esa-income-description', '#esa-income-description',
        'Description must be 100 characters or fewer')
    }

    if (errors.length) {
      data.dccErrors = errors
      return res.redirect('/dccesa#income')
    }

    saveRow(data, 'esaIncomes', body.editIncomeIndex, {
      date: dateFrom(body, 'esaIncomeDate'),
      dateParts: dateParts(body, 'esaIncomeDate'),
      amount: parseAmount(body.esaIncomeAmount),
      paymentPeriod: body.esaIncomePaymentPeriod || '',
      disregard: parseAmount(body.esaIncomeDisregard),
      description: body.esaIncomeDescription || ''
    })

    clearFields(data, incomeFields)
    delete data.editIncome
    delete data.dccErrors
    return res.redirect('/dccesa#income')
  }

  // ----- Tariff income -----
  if (action === 'add-tariff') {
    fail('tariff-income', 'Tariff Income', 'esa-tariff-date', '#esa-tariff-date-day',
      checkDateInPeriod(body, 'esaTariffDate', 'the date this tariff income applies from'))
    fail('tariff-income', 'Tariff Income', 'esa-tariff-amount', '#esa-tariff-amount',
      checkAmount(body.esaTariffAmount, 'the amount'))

    if (!errors.length) {
      const date = dateFrom(body, 'esaTariffDate')
      const clash = (data.esaTariffs || []).some(function (tariff, i) {
        return tariff.date === date && String(i) !== String(body.editTariffIndex)
      })

      if (clash) {
        fail('tariff-income', 'Tariff Income', 'esa-tariff-date', '#esa-tariff-date-day',
          'Tariff income has already been recorded for ' + date + '. Edit that entry, or use a different date.')
      }
    }

    if (errors.length) {
      data.dccErrors = errors
      return res.redirect('/dccesa#tariff-income')
    }

    saveRow(data, 'esaTariffs', body.editTariffIndex, {
      date: dateFrom(body, 'esaTariffDate'),
      dateParts: dateParts(body, 'esaTariffDate'),
      amount: parseAmount(body.esaTariffAmount)
    })

    clearFields(data, tariffFields)
    delete data.editTariff
    delete data.dccErrors
    return res.redirect('/dccesa#tariff-income')
  }

  // ----- Residential care -----
  if (action === 'add-rescare') {
    fail('res-care', 'Res.Care', 'esa-res-care-from', '#esa-res-care-from-day',
      checkDateInPeriod(body, 'esaResCareFrom', 'the date the period started'))

    // The end date is optional, but has to be real if given, and cannot be
    // before the start.
    const toGiven = anyGiven(body, [
      'esaResCareTo-day', 'esaResCareTo-month', 'esaResCareTo-year'
    ])

    if (toGiven) {
      fail('res-care', 'Res.Care', 'esa-res-care-to', '#esa-res-care-to-day',
        checkDateInPeriod(body, 'esaResCareTo', 'the date the period ended'))
    }

    if (!errors.length && toGiven) {
      const from = dateValue(dateParts(body, 'esaResCareFrom'))
      const to = dateValue(dateParts(body, 'esaResCareTo'))

      if (from && to && to < from) {
        fail('res-care', 'Res.Care', 'esa-res-care-to', '#esa-res-care-to-day',
          'The date the period ended must be the same as or after the date it started')
      }
    }

    // Two residential care periods cannot cover the same day.
    if (!errors.length) {
      const from = dateValue(dateParts(body, 'esaResCareFrom'))
      const to = toGiven ? dateValue(dateParts(body, 'esaResCareTo')) : DCC_TO

      const overlap = (data.esaResCare || []).some(function (period, i) {
        if (String(i) === String(body.editResCareIndex)) { return false }

        const otherFrom = dateValue(period.fromParts)
        const otherTo = period.toParts && period.toParts.year
          ? dateValue(period.toParts)
          : DCC_TO

        return otherFrom && from <= otherTo && to >= otherFrom
      })

      if (overlap) {
        fail('res-care', 'Res.Care', 'esa-res-care-from', '#esa-res-care-from-day',
          'This period overlaps one already recorded. Change the dates, or edit the period already there.')
      }
    }

    if (errors.length) {
      data.dccErrors = errors
      return res.redirect('/dccesa#res-care')
    }

    saveRow(data, 'esaResCare', body.editResCareIndex, {
      from: dateFrom(body, 'esaResCareFrom'),
      fromParts: dateParts(body, 'esaResCareFrom'),
      to: toGiven ? dateFrom(body, 'esaResCareTo') : 'Ongoing',
      toParts: dateParts(body, 'esaResCareTo'),
      pensioner: body.esaPensioner ? 'yes' : ''
    })

    clearFields(data, resCareFields)
    delete data.editResCare
    delete data.dccErrors
    return res.redirect('/dccesa#res-care')
  }

  // ----- Run the calculation -----
  const runErrors = dccEsaRunErrors(data, body)

  if (runErrors.length) {
    data.dccErrors = runErrors
    return res.redirect('/dccesa')
  }

  data.dccComplete = 'yes'
  data.caseBanner = 'dcc'
  delete data.caseBannerSeen
  delete data.dccErrors

  console.log('DCC (ESA): calculation run, redirecting to ' + CASE_OVERVIEW_PAGE)

  res.redirect(CASE_OVERVIEW_PAGE)
})

// ---------------------------------------------------------------------------
// Edit, cancel and delete a row
// ---------------------------------------------------------------------------

const esaTabs = {
  rate: { array: 'esaRates', tab: 'esa-paid', marker: 'editRate' },
  income: { array: 'esaIncomes', tab: 'income', marker: 'editIncome' },
  tariff: { array: 'esaTariffs', tab: 'tariff-income', marker: 'editTariff' },
  rescare: { array: 'esaResCare', tab: 'res-care', marker: 'editResCare' }
}

// Edit puts the row back into the Add form and marks which row is being
// changed, so saving replaces it rather than adding a second copy.
router.get('/dccesa-edit-:key', function (req, res) {
  const data = req.session.data
  const config = esaTabs[req.params.key]
  const index = req.query.index

  if (!config) { return res.redirect('/dccesa') }

  const row = (data[config.array] || [])[index]

  if (!row) { return res.redirect('/dccesa#' + config.tab) }

  if (req.params.key === 'rate') {
    data['esaRateDate-day'] = row.dateParts.day
    data['esaRateDate-month'] = row.dateParts.month
    data['esaRateDate-year'] = row.dateParts.year
    data.esaRateAmount = row.amount
    data.esaRateTaxable = row.taxable ? 'taxable' : ''
    data.esaTaxableElements = row.taxableElements
  }

  if (req.params.key === 'income') {
    data['esaIncomeDate-day'] = row.dateParts.day
    data['esaIncomeDate-month'] = row.dateParts.month
    data['esaIncomeDate-year'] = row.dateParts.year
    data.esaIncomeAmount = row.amount
    data.esaIncomePaymentPeriod = row.paymentPeriod
    data.esaIncomeDisregard = row.disregard
    data.esaIncomeDescription = row.description
  }

  if (req.params.key === 'tariff') {
    data['esaTariffDate-day'] = row.dateParts.day
    data['esaTariffDate-month'] = row.dateParts.month
    data['esaTariffDate-year'] = row.dateParts.year
    data.esaTariffAmount = row.amount
  }

  if (req.params.key === 'rescare') {
    data['esaResCareFrom-day'] = row.fromParts.day
    data['esaResCareFrom-month'] = row.fromParts.month
    data['esaResCareFrom-year'] = row.fromParts.year
    data['esaResCareTo-day'] = row.toParts.day
    data['esaResCareTo-month'] = row.toParts.month
    data['esaResCareTo-year'] = row.toParts.year
    data.esaPensioner = row.pensioner ? 'pensioner' : ''
  }

  data[config.marker] = index
  delete data.dccErrors

  res.redirect('/dccesa#' + config.tab)
})

// Cancel an edit - empties the form and forgets which row was being changed.
router.get('/dccesa-cancel-:key', function (req, res) {
  const data = req.session.data
  const config = esaTabs[req.params.key]

  if (!config) { return res.redirect('/dccesa') }

  const fields = {
    rate: rateFields,
    income: incomeFields,
    tariff: tariffFields,
    rescare: resCareFields
  }

  clearFields(data, fields[req.params.key])
  delete data[config.marker]
  delete data.dccErrors

  res.redirect('/dccesa#' + config.tab)
})

// Delete a row from one of the tabs. The link says which array and which row.
router.get('/dccesa-delete-:key', function (req, res) {
  const data = req.session.data
  const index = req.query.index

  // The exclusions tab holds a single entry rather than an array.
  if (req.params.key === 'exclusion') {
    clearFields(data, [
      'esaExclusionReason', 'esaExclusionCode',
      'esaExclusionFrom-day', 'esaExclusionFrom-month', 'esaExclusionFrom-year',
      'esaExclusionTo-day', 'esaExclusionTo-month', 'esaExclusionTo-year'
    ])
    return res.redirect('/dccesa#exclusions')
  }

  const config = esaTabs[req.params.key]

  if (!config) { return res.redirect('/dccesa') }

  data[config.array] = (data[config.array] || []).filter(function (row, i) {
    return String(i) !== String(index)
  })

  // Deleting the row being edited leaves the form pointing at nothing.
  if (String(data[config.marker]) === String(index)) {
    delete data[config.marker]
  }

  delete data.dccErrors

  res.redirect('/dccesa#' + config.tab)
})

// Old asset value page kept working - it posts here before the warning.
router.post('/dccesa-asset-value', function (req, res) {
  res.redirect('/dccesaassetvaluesalreadyexist')
})

// ---------------------------------------------------------------------------
// Cases - save, open and delete
// ---------------------------------------------------------------------------
//
// Saved cases live in a savedCases array in the session, so they survive
// moving around the prototype but are cleared by "Clear data".
//

// Save the case - snapshots the session against the case reference. Saving
// again overwrites rather than creating a duplicate.
router.post('/case-save', function (req, res) {
  const data = req.session.data
  const cases = data.savedCases || []
  const nino = data.nino || 'AB 12 34 56 C'

  const snapshot = Object.assign({}, data)
  delete snapshot.savedCases
  delete snapshot.caseSaved
  delete snapshot.caseDeleted
  delete snapshot.caseToDelete
  delete snapshot.returnTo
  delete snapshot.dccErrors

  const record = {
    nino: nino,
    surname: data.surname || 'Martin',
    benefit: data.benefit || '',
    savedAt: new Date().toLocaleDateString('en-GB'),
    snapshot: snapshot
  }

  const existing = cases.findIndex(function (c) { return c.nino === nino })

  if (existing > -1) {
    cases[existing] = record
  } else {
    cases.push(record)
  }

  data.savedCases = cases
  data.caseSaved = 'yes'

  res.redirect('/opcalctype')
})

// Open a saved case - restores its snapshot over the current session.
router.get('/case-open/:index', function (req, res) {
  const cases = req.session.data.savedCases || []
  const record = cases[req.params.index]

  if (!record) {
    return res.redirect('/openingexistingcase')
  }

  req.session.data = Object.assign({}, record.snapshot, { savedCases: cases })

  res.redirect('/opcalctype')
})

// Coming from /deleteacase - a case was picked from the list, so go and
// confirm it. caseToDelete holds which one.
router.post('/case-delete-select', function (req, res) {
  res.redirect('/deletecase')
})

// Coming from /opcalctype - deleting the case that is currently open.
// Clear any stale pick from /deleteacase first, or the confirmation page
// would show the wrong case and delete the wrong one.
router.get('/deletecase-open', function (req, res) {
  delete req.session.data.caseToDelete
  res.redirect('/deletecase')
})

// Delete a case, confirmed from /deletecase.
//
// Two ways to get here:
//   - from /deleteacase, where a case was picked from the list. caseToDelete
//     holds its position in savedCases, and whatever is open stays open.
//   - from /opcalctype, deleting the case currently open. No caseToDelete, so
//     we go by the NINO in the session and clear the working data too.
router.post('/case-delete', function (req, res) {
  const data = req.session.data
  const cases = data.savedCases || []
  const picked = data.caseToDelete

  if (picked !== undefined && picked !== '') {
    const remaining = cases.filter(function (c, i) { return String(i) !== String(picked) })
    data.savedCases = remaining
    data.caseDeleted = 'yes'
    delete data.caseToDelete
    return res.redirect('/landingpage')
  }

  const remaining = cases.filter(function (c) { return c.nino !== data.nino })

  req.session.data = {
    savedCases: remaining,
    caseDeleted: 'yes'
  }

  res.redirect('/landingpage')
})