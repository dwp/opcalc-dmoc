//
// Add this to app/routes.js, alongside the IS/JSA routes.
//

// The PC/ISPC tabs page has several submit buttons in one form - an Add button
// on three of the tabs, plus Run the calculation. They all post here, and the
// 'action' value tells us which one was pressed. Each Add sends you back to
// the tab you were on, using the tab's id as a URL hash.
router.post('/dccpcispc-action', function (req, res) {
  const action = req.session.data['action']

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

// Asset page: choosing Yes or No to "Is this an accumulating asset?" swaps
// which set of fields you get. Yes gives start/end dates and initial/final
// values. No gives a list of dated values.
router.post('/dccpcispc-asset-accumulating', function (req, res) {
  const accumulating = req.session.data['pcispcAccumulatingAsset']

  if (accumulating === 'yes') {
    res.redirect('/dccpcispcnewassetaccumulatingassetyes')
  } else {
    res.redirect('/dccpcispcnewassetaccumulatingassetno')
  }
})

// Asset value page: saving a value shows the "already exists" warning.
// In the real system this only fires when the date matches a value already
// recorded against that asset - a prototype cannot work that out, so it
// always fires. To skip it, redirect straight to /dccpcispc instead.
router.post('/dccpcispc-asset-value', function (req, res) {
  res.redirect('/dccpcispcassetvaluesalreadyexist')
})

// Already exists warning: Yes replaces the value and returns to the tabs,
// No goes back so the person can enter a different date.
router.post('/dccpcispc-value-replace', function (req, res) {
  const replace = req.session.data['pcispcReplaceValue']

  if (replace === 'no') {
    res.redirect('/dccpcispcassetsshowvalues')
  } else {
    res.redirect('/dccpcispc#assets')
  }
})
