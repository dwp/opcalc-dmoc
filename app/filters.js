//
// For guidance on how to create filters see:
// https://prototype-kit.service.gov.uk/docs/filters
//

const govukPrototypeKit = require('govuk-prototype-kit')
const addFilter = govukPrototypeKit.views.addFilter

// Add your filters here


// Today's date written out, for example "7 October 2026". Used on the
// printed A14s, which now carry the name of the person who completed them
// and the date (David adds both by hand to every page today, for appeals).
addFilter('todayDate', function () {
  return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
})
