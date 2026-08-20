//
// Add these to app/routes.js
//

// The DCC tabs page has several submit buttons in one form - an Add button on
// four of the tabs, plus Run the calculation. They all post here, and the
// 'action' value tells us which one was pressed. Each Add sends you back to
// the tab you were on, using the tab's id as a URL hash.
router.post('/dccisjsa-action', function (req, res) {
  const action = req.session.data['action']

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

// Asset page: choosing Yes or No to "Is this an accumulating asset?" swaps
// which set of fields you get. Yes gives start/end dates and initial/final
// values. No gives a list of dated values.
router.post('/dccisjsa-asset-accumulating', function (req, res) {
  const accumulating = req.session.data['isjsaAccumulatingAsset']

  if (accumulating === 'yes') {
    res.redirect('/dccisjsaassetsnewassetaccumulatingassetyes')
  } else {
    res.redirect('/dccisjsaassetsnewassetaccumulatingassetno')
  }
})

// Asset value page: saving a value shows the "already exists" warning.
// In the real system this only fires when the date matches a value already
// recorded against that asset - a prototype cannot work that out, so it
// always fires. To skip it, redirect straight to /dccisjsa instead.
router.post('/dccisjsa-asset-value', function (req, res) {
  res.redirect('/dccisjsaassetstickshowvaluesalreadyexists')
})

// Already exists warning: Yes replaces the value and returns to the tabs,
// No goes back so the person can enter a different date.
router.post('/dccisjsa-value-replace', function (req, res) {
  const replace = req.session.data['isjsaReplaceValue']

  if (replace === 'no') {
    res.redirect('/dccisjsaassetstickshowvalues')
  } else {
    res.redirect('/dccisjsa#assets')
  }
})
