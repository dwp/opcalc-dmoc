//
// Add these to app/routes.js
//
// Saving, opening and deleting cases. Saved cases live in a savedCases array
// in the session, so they survive moving around the prototype but are cleared
// by "Clear data" like everything else.
//

// Save the case - takes a snapshot of everything currently in the session and
// stores it against the case reference. Saving again overwrites the snapshot
// rather than creating a duplicate.
router.post('/case-save', function (req, res) {
  const data = req.session.data
  const cases = data.savedCases || []
  const nino = data.nino || 'AB 12 34 56 C'

  // Copy the session, minus the saved list itself and any one-off flags.
  const snapshot = Object.assign({}, data)
  delete snapshot.savedCases
  delete snapshot.caseSaved
  delete snapshot.caseDeleted
  delete snapshot.caseToDelete

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

// Coming from /deleteacase - remember which case was picked, then send the
// person to the confirmation page.
router.post('/case-delete-select', function (req, res) {
  res.redirect('/deletecase')
})

// Delete a case, confirmed from /deletecase.
//
// Two ways to get here:
//   - from /deleteacase, where a case was picked from the list. caseToDelete
//     holds its position in savedCases.
//   - from /opcalctype, deleting the case currently open. No caseToDelete,
//     so we go by the NINO in the session and wipe the working data too.
router.post('/case-delete', function (req, res) {
  const data = req.session.data
  const cases = data.savedCases || []
  const picked = data.caseToDelete

  if (picked !== undefined && picked !== '') {
    // Deleting a case from the list. Leave whatever is open alone.
    const remaining = cases.filter(function (c, i) { return String(i) !== String(picked) })
    data.savedCases = remaining
    data.caseDeleted = 'yes'
    delete data.caseToDelete
    return res.redirect('/landingpage')
  }

  // Deleting the case that is currently open, so clear the session as well.
  const remaining = cases.filter(function (c) { return c.nino !== data.nino })

  req.session.data = {
    savedCases: remaining,
    caseDeleted: 'yes'
  }

  res.redirect('/landingpage')
})
