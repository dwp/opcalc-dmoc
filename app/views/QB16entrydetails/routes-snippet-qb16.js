//
// Add this to app/routes.js, inside the file (above module.exports if there
// is one). It handles the Yes/No branch on the overlapping dates warning.
//
// Yes  -> dates get adjusted, so the entry is accepted and you go back to
//         the list of entries
// No   -> you go back to the entry so you can change the dates yourself
//

router.post('/qb16-overlap-answer', function (req, res) {
  const adjustDates = req.session.data['adjustDates']

  if (adjustDates === 'no') {
    res.redirect('/qb16entrydetails')
  } else {
    res.redirect('/qb16listofentries#list-of-entries')
  }
})
