//
// Add this to app/routes.js
//
// Sending someone back to the tab they came from.
//
// Sub-pages like "New dependant" or "New exclusion" open from a tab on a
// parent page. When they save, they should land back on that tab rather than
// on the first one.
//
// A form cannot do this on its own: a fragment like #dependants in a form
// action is dropped when the form posts. A redirect keeps it, because the
// fragment travels in the Location header.
//
// Each sub-page posts here with a hidden returnTo field holding the path and
// tab to land on, for example /a14isjsa#dependants.
//
router.post('/return-to-tab', function (req, res) {
  const destination = req.session.data['returnTo']

