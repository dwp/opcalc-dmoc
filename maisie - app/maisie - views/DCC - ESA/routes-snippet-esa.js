//
// Add this to app/routes.js, alongside the IS/JSA and PC/ISPC routes.
//

// The ESA tabs page has several submit buttons in one form - an Add button on
// four of the tabs, plus Run the calculation. They all post here, and the
// 'action' value tells us which one was pressed. Each Add sends you back to
// the tab you were on, using the tab's id as a URL hash.
router.post('/dccesa-action', function (req, res) {
  const action = req.session.data['action']

  if (action === 'add-rate') {
    res.redirect('/dccesa#esa-paid')
  } else if (action === 'add-income') {
    res.redirect('/dccesa#income')
  } else if (action === 'add-tariff') {
    res.redirect('/dccesa#tariff-income')
  } else if (action === 'add-rescare') {
    res.redirect('/dccesa#res-care')
  } else {
    res.redirect('/dccesacaseoverview')
  }
})

// Asset page: choosing Yes or No to "Is this an accumulating asset?" swaps
// which set of fields you get.
router.post('/dccesa-asset-accumulating', function (req, res) {
  const accumulating = req.session.data['esaAccumulatingAsset']

  if (accumulating === 'yes') {
    res.redirect('/dccesanewassetaccumulatingassetyes')
  } else {
    res.redirect('/dccesanewassetaccumulatingassetno')
  }
})

// Asset value page: saving a value shows the "already exists" warning.
// In the real system this only fires when the date matches a value already
// recorded against that asset - a prototype cannot work that out, so it
// always fires. To skip it, redirect straight to /dccesa instead.
router.post('/dccesa-asset-value', function (req, res) {
  res.redirect('/dccesaassetvaluesalreadyexist')
})

// Already exists warning: Yes replaces the value and returns to the tabs,
// No goes back so the person can enter a different date.
router.post('/dccesa-value-replace', function (req, res) {
  const replace = req.session.data['esaReplaceValue']

  if (replace === 'no') {
    res.redirect('/dccesaassetsshowvalues')
  } else {
    res.redirect('/dccesa#assets')
  }
})
