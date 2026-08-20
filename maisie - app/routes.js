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
router.post('/return-to-tab', function (req, res) {
  const destination = req.body.returnTo || req.session.data.returnTo

  // Clear it once used. Otherwise a sub-page opened later without its own
  // returnTo would send someone back to whatever tab was visited last.
  delete req.session.data.returnTo

  res.redirect(destination || '/opcalctype')
})

// ---------------------------------------------------------------------------
// A14 forms - which form to open depends on the benefit type
// ---------------------------------------------------------------------------

router.post('/newform', function (req, res) {
  const benefit = req.session.data.benefit

  if (benefit === 'IS' || benefit === 'JSA' || benefit === 'IS-JSA') {
    res.redirect('/a14isjsa')
  } else if (benefit === 'IS-PC' || benefit === 'PC') {
    res.redirect('/a14')
  } else if (benefit === 'ESA') {
    res.redirect('/a14esa')
  } else {
    res.redirect('/a14')
  }
})

// ---------------------------------------------------------------------------
// QB16
// ---------------------------------------------------------------------------

// Overlapping dates warning.
// Yes - dates get adjusted, so the entry is accepted.
// No  - go back to the entry so the dates can be changed.
router.post('/qb16-overlap-answer', function (req, res) {
  const adjustDates = req.body.adjustDates || req.session.data.adjustDates

  if (adjustDates === 'no') {
    res.redirect('/qb16entrydetails')
  } else {
    res.redirect('/qb16listofentries#list-of-entries')
  }
})

// ---------------------------------------------------------------------------
// DCC - Income Support / Jobseeker's Allowance
// ---------------------------------------------------------------------------

// The tabs page has several submit buttons in one form. The 'action' value
// says which was pressed, and each Add returns to the tab it came from.
router.post('/dccisjsa-action', function (req, res) {
  const action = req.body.action || req.session.data.action

  if (action === 'add-rate') {
    res.redirect('/dccisjsa#isjsa-paid')
  } else if (action === 'add-income') {
    res.redirect('/dccisjsa#income')
  } else if (action === 'add-tariff') {
    res.redirect('/dccisjsa#tariff-income')
  } else if (action === 'add-rescare') {
    res.redirect('/dccisjsa#res-care-pens')
  } else {
    res.redirect('/dccisjsanewentry')
  }
})

// Asset value page: saving shows the "already exists" warning. In the real
// system this only fires when the date matches an existing value - a
// prototype cannot work that out, so it always fires. To skip it, redirect
// straight to /dccisjsa#assets instead.
router.post('/dccisjsa-asset-value', function (req, res) {
  res.redirect('/dccisjsaassetstickshowvaluesalreadyexists')
})

// Already exists warning: Yes replaces the value, No goes back to change the date.
router.post('/dccisjsa-value-replace', function (req, res) {
  const replace = req.body.isjsaReplaceValue || req.session.data.isjsaReplaceValue

  if (replace === 'no') {
    res.redirect('/dccisjsaassetstickshowvalues')
  } else {
    res.redirect('/dccisjsa#assets')
  }
})

// ---------------------------------------------------------------------------
// DCC - Pension Credit / Income Support and Pension Credit
// ---------------------------------------------------------------------------

router.post('/dccpcispc-action', function (req, res) {
  const action = req.body.action || req.session.data.action

  if (action === 'add-rate') {
    res.redirect('/dccpcispc#amount-paid')
  } else if (action === 'add-income') {
    res.redirect('/dccpcispc#income')
  } else if (action === 'add-rescare') {
    res.redirect('/dccpcispc#res-care')
  } else {
    res.redirect('/dccpcispccaseoverview')
  }
})

router.post('/dccpcispc-asset-value', function (req, res) {
  res.redirect('/dccpcispcassetvaluesalreadyexist')
})

router.post('/dccpcispc-value-replace', function (req, res) {
  const replace = req.body.pcispcReplaceValue || req.session.data.pcispcReplaceValue

  if (replace === 'no') {
    res.redirect('/dccpcispcassetsshowvalues')
  } else {
    res.redirect('/dccpcispc#assets')
  }
})

// ---------------------------------------------------------------------------
// DCC - Employment and Support Allowance
// ---------------------------------------------------------------------------


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

//
// Add these two to app/routes.js, in the QB16 section.
//

// Clear the cause box on the QB16 list of entries, so standard text that was
// inserted can be removed and started again. Both fields go, because the
// textarea shows whichever of the two is set.

// Delete a QB16 entry, confirmed from /qb16deleteentry. Clears the fields the
// entries table reads, so the row disappears and the empty state comes back.

//
// Add these two to app/routes.js, in the QB16 section.
//

// Clear the cause box on the QB16 list of entries, so standard text that was
// inserted can be removed and started again. Both fields go, because the
// textarea shows whichever of the two is set.
router.get('/qb16-clear-cause', function (req, res) {
  delete req.session.data.cause
  delete req.session.data.standardText

  res.redirect('/qb16listofentries#list-of-entries')
})

// Delete a QB16 entry, confirmed from /qb16deleteentry. Clears the fields the
// entries table reads, so the row disappears and the empty state comes back.
router.post('/qb16-delete-entry', function (req, res) {
  const data = req.session.data

  delete data.grossIncorrect
  delete data.grossCorrect
  delete data.personalAllowance
  delete data.taxableGrossExcess
  delete data.netIncorrect
  delete data.netCorrect
  delete data.taxable
  delete data.underpaid
  delete data.calculationOptions
  delete data['qb16From-day']
  delete data['qb16From-month']
  delete data['qb16From-year']
  delete data['qb16To-day']
  delete data['qb16To-month']
  delete data['qb16To-year']

  res.redirect('/qb16listofentries#list-of-entries')
})

// Delete a benefit week, confirmed from /qb16deletebenefitweek.
router.post('/qb16-delete-benefit-week', function (req, res) {
  const data = req.session.data

  delete data.benefitPayDay
  delete data.benefitWeekType
  delete data['bwDateOfChange-day']
  delete data['bwDateOfChange-month']
  delete data['bwDateOfChange-year']

  res.redirect('/qb16listofentries#bwe-bwc')
})

// Delete an exclusion, confirmed from /qb16deleteexclusion.
router.post('/qb16-delete-exclusion', function (req, res) {
  const data = req.session.data

  delete data.exclusionReason
  delete data.exclusionCode
  delete data['exclusionFrom-day']
  delete data['exclusionFrom-month']
  delete data['exclusionFrom-year']
  delete data['exclusionTo-day']
  delete data['exclusionTo-month']
  delete data['exclusionTo-year']

  res.redirect('/qb16listofentries#bwe-bwc')
})


//
// Add these to app/routes.js, in the DCC ESA section.
//
// Assets are held as an array so a case can have more than one, each with its
// own list of dated values:
//
//   data.esaAssets = [
//     { type, name, shareHeld, shareTotal, accumulating, values: [ { date, amount } ] }
//   ]
//

// Save an asset. With an assetIndex it updates that one, otherwise it adds a
// new one to the end of the list.
router.post('/dccesa-asset-save', function (req, res) {
  const data = req.session.data
  const assets = data.esaAssets || []
  const index = req.body.assetIndex

  const asset = {
    type: req.body.esaAssetType || 'Not given',
    name: req.body.esaAssetName || '',
    shareHeld: req.body.esaShareHeld || '1',
    shareTotal: req.body.esaShareTotal || '1',
    accumulating: req.body.esaAccumulatingAsset || 'no',
    values: []
  }

  if (index !== undefined && index !== '') {
    // Editing, so keep the values already recorded against it.
    asset.values = assets[index].values || []
    assets[index] = asset
  } else {
    assets.push(asset)
  }

  data.esaAssets = assets
  data.dccComplete = 'yes'

  // Clear the one-off fields so the next New asset starts empty.
  delete data.esaAssetType
  delete data.esaAssetName
  delete data.esaShareHeld
  delete data.esaShareTotal
  delete data.asset

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
  const index = req.body.assetIndex
  const asset = (data.esaAssets || [])[index]

  if (!asset) {
    return res.redirect('/dccesa#assets')
  }

  const date = req.body['esaNewValueDate-day'] + '/' +
               req.body['esaNewValueDate-month'] + '/' +
               req.body['esaNewValueDate-year']

  const clash = (asset.values || []).some(function (v) { return v.date === date })

  if (clash) {
    return res.redirect('/dccesaassetvaluesalreadyexist')
  }

  asset.values = asset.values || []
  asset.values.push({ date: date, amount: req.body.esaNewValue || '0.00' })

  // Show the values straight away, so the new one is visible.
  data.esaShowValues = 'showValues'

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
    return v.date === date ? { date: date, amount: data.esaNewValue || '0.00' } : v
  })

  data.esaShowValues = 'showValues'

  res.redirect('/dccesa#assets')
})

//
// Add these to app/routes.js, in the DCC ESA section.
// They REPLACE the existing /dccesa-action route.
//
// Each tab keeps its rows in an array, so a case can have as many as it needs:
//
//   data.esaRates    = [ { date, amount, taxableElements } ]
//   data.esaIncomes  = [ { date, amount, paymentPeriod, disregard, description } ]
//   data.esaTariffs  = [ { date, amount } ]
//   data.esaResCare  = [ { from, to, pensioner } ]
//

// Builds a dd/mm/yyyy string from a date input's three fields.
function dateFrom (body, prefix) {
  return body[prefix + '-day'] + '/' + body[prefix + '-month'] + '/' + body[prefix + '-year']
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

// One route for every submit button on the DCC ESA tabs. The 'action' value
// says which was pressed, and each Add returns to the tab it came from.
router.post('/dccesa-action', function (req, res) {
  const data = req.session.data
  const body = req.body
  const action = body.action

  if (action === 'add-rate') {
    saveRow(data, 'esaRates', body.editRateIndex, {
      date: dateFrom(body, 'esaRateDate'),
      dateParts: dateParts(body, 'esaRateDate'),
      amount: body.esaRateAmount || '0.00',
      taxable: body.esaRateTaxable ? 'yes' : '',
      taxableElements: body.esaTaxableElements || ''
    })
    delete data.editRate
    return res.redirect('/dccesa#esa-paid')
  }

  if (action === 'add-income') {
    saveRow(data, 'esaIncomes', body.editIncomeIndex, {
      date: dateFrom(body, 'esaIncomeDate'),
      dateParts: dateParts(body, 'esaIncomeDate'),
      amount: body.esaIncomeAmount || '0.00',
      paymentPeriod: body.esaIncomePaymentPeriod || '',
      disregard: body.esaIncomeDisregard || '',
      description: body.esaIncomeDescription || ''
    })
    delete data.editIncome
    return res.redirect('/dccesa#income')
  }

  if (action === 'add-tariff') {
    saveRow(data, 'esaTariffs', body.editTariffIndex, {
      date: dateFrom(body, 'esaTariffDate'),
      dateParts: dateParts(body, 'esaTariffDate'),
      amount: body.esaTariffAmount || '0.00'
    })
    delete data.editTariff
    return res.redirect('/dccesa#tariff-income')
  }

  if (action === 'add-rescare') {
    saveRow(data, 'esaResCare', body.editResCareIndex, {
      from: dateFrom(body, 'esaResCareFrom'),
      fromParts: dateParts(body, 'esaResCareFrom'),
      to: dateFrom(body, 'esaResCareTo'),
      toParts: dateParts(body, 'esaResCareTo'),
      pensioner: 'No'
    })
    delete data.editResCare
    return res.redirect('/dccesa#res-care')
  }

  // Run the calculation.
  data.dccComplete = 'yes'
  res.redirect('/dccesacaseoverview')
})

// Delete a row from one of the tabs. The link says which array and which row.
router.get('/dccesa-delete-:key', function (req, res) {
  const data = req.session.data
  const index = req.query.index

  const arrays = {
    editRate: 'esaRates',
    editIncome: 'esaIncomes',
    editTariff: 'esaTariffs',
    editResCare: 'esaResCare'
  }

  const tabs = {
    editRate: 'esa-paid',
    editIncome: 'income',
    editTariff: 'tariff-income',
    editResCare: 'res-care'
  }

  // The exclusions tab holds a single entry rather than an array.
  if (req.params.key === 'exclusion') {
    delete data.esaExclusionReason
    delete data.esaExclusionCode
    delete data['esaExclusionFrom-day']
    delete data['esaExclusionFrom-month']
    delete data['esaExclusionFrom-year']
    delete data['esaExclusionTo-day']
    delete data['esaExclusionTo-month']
    delete data['esaExclusionTo-year']
    return res.redirect('/dccesa#exclusions')
  }

  const arrayName = arrays[req.params.key]

  if (!arrayName) {
    return res.redirect('/dccesa')
  }

  data[arrayName] = (data[arrayName] || []).filter(function (row, i) {
    return String(i) !== String(index)
  })
})