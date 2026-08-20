//
// For guidance on how to add JavaScript see:
// https://prototype-kit.service.gov.uk/docs/adding-css-javascript-and-images
//

// ===========================================================================
// 1. Keeping what is typed on a tabbed form
// ===========================================================================
//
// The tabs on an A14 page are one big form, and the Prototype Kit only saves
// fields when a form is posted. So nothing typed on Customer, Housing or
// Income is kept until "Generate A14 forms" is pressed - and clicking "New
// benefit week" from a tab navigates away without submitting, losing
// everything on every tab.
//
// This takes a copy of the form and sends it to /a14-autosave as fields
// change, and again just before following any link. The route only ever
// merges what it is sent, so this can never clear anything.

window.GOVUKPrototypeKit.documentReady(() => {
  const tabs = document.querySelector('form .govuk-tabs')
  const form = tabs ? tabs.closest('form') : null

  if (!form) {
    return
  }

  let pending = null

  function save (leaving) {
    try {
      const body = new URLSearchParams(new FormData(form)).toString()

      window.fetch('/a14-autosave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body,
        // keepalive lets the request finish after the page has navigated
        // away, which is the whole point when someone clicks a link.
        keepalive: !!leaving
      })
    } catch (e) {
      // Saving is a convenience - if it fails the form still works normally,
      // so there is nothing worth interrupting anyone for.
    }
  }

  // Typing fires constantly, so wait for a pause rather than sending on every
  // keystroke.
  function saveSoon () {
    window.clearTimeout(pending)
    pending = window.setTimeout(save, 500)
  }

  form.addEventListener('input', saveSoon)

  // Radios, checkboxes and selects are a single decision, so save immediately.
  form.addEventListener('change', function () {
    window.clearTimeout(pending)
    save()
  })

  // Any link that leaves the page - "New benefit week", "New exclusion", a
  // back link, anything. Tab links are ignored, since they stay put.
  document.addEventListener('click', function (event) {
    if (!event.target || !event.target.closest) { return }

    const link = event.target.closest('a[href]')
    if (!link) { return }

    const href = link.getAttribute('href') || ''

    if (href.charAt(0) === '#' || href.indexOf('javascript:') === 0) { return }

    window.clearTimeout(pending)
    save(true)
  })

  // Catches anything else - closing the tab, the back button, a form
  // submitting elsewhere.
  window.addEventListener('pagehide', function () {
    window.clearTimeout(pending)
    save(true)
  })
})

// ===========================================================================
// 2. Checking answers before they are saved
// ===========================================================================
//
// Covers two kinds of page:
//
//   the A14 forms themselves - six tabs of one form, checked when "Generate
//   A14 forms" is pressed
//
//   the sub-pages the tabs link to - "New benefit week", "New exclusion",
//   "Change of benefit payment day" and the rest - checked when Save is
//   pressed
//
// Both follow "Recover from validation errors" from the GOV.UK Design System:
//
//   - nothing is checked until someone tries to move on, so a slow typist is
//     never told they are wrong halfway through a number
//   - every problem is listed in an error summary at the top of the page
//   - each entry links to the field it is about
//   - the same wording appears in the summary and next to the field
//   - "Error: " goes on the front of the page title
//   - what was typed is never cleared
//
// One thing here is not standard, and it is deliberate. The Design System
// assumes the server checks the answers and sends back a fresh page. An A14
// form is six tabs of one form, and a fresh page would drop you back on the
// first tab - away from the problem, which is the opposite of helpful. So the
// checking happens in the browser, on the way out. The markup and the wording
// are exactly the same; only the timing differs.

window.GOVUKPrototypeKit.documentReady(() => {
  // -------------------------------------------------------------------------
  // THE RULES FOR THE A14 FORMS
  // -------------------------------------------------------------------------
  //
  // The sub-pages further down do not need any of this - they are read
  // straight off the page. This is only for the three A14 forms.
  //
  //   field     the name attribute on the input. For a date, the namePrefix
  //   id        the id attribute, so the summary can link to it
  //   label     how the field is named in the message. Match the visible label
  //   tab       the id of the tab it sits on
  //   type      money | wholeNumber | date | text
  //   requiredWhen    optional. Given (value, values), return true to make the
  //                   field mandatory. values() is for checkboxes, which can
  //                   have more than one answer
  //   missingMessage  optional. What to say when a required field is empty.
  //                   Without it the message is built from the label, which
  //                   reads oddly for some of them
  //   mustBePast      dates only. Rejects a date later than today
  //
  // The three A14 forms ask for housing costs in exactly the same way - the
  // same nine questions, with a different prefix on every name and id. Writing
  // them out three times would mean fixing every future change three times, so
  // they are built from the prefix instead.
  //
  function housingRules (prefix, idPrefix) {
    return [
      { field: prefix + 'Interest', id: idPrefix + 'interest', label: 'Interest', tab: 'housing', type: 'money' },
      { field: prefix + 'GroundRent', id: idPrefix + 'ground-rent', label: 'Ground rent / Service or rent charge', tab: 'housing', type: 'money' },
      { field: prefix + 'OtherCosts', id: idPrefix + 'other-costs', label: 'Other costs', tab: 'housing', type: 'money' },
      { field: prefix + 'YearlyTotal', id: idPrefix + 'yearly-total', label: 'Yearly total', tab: 'housing', type: 'money' },
      { field: prefix + 'WeeklyTotalHousing', id: idPrefix + 'weekly-total-housing', label: 'Weekly total', tab: 'housing', type: 'money' },
      {
        field: prefix + 'FirstDayEntitlement',
        id: idPrefix + 'first-day-entitlement',
        label: 'First day of entitlement',
        tab: 'housing',
        type: 'date'
        // Not marked mustBePast - a case can be set up ahead of the date.
      },
      { field: prefix + '0PercentWeeks', id: idPrefix + '0-percent-weeks', label: '0% allowable for (weeks)', tab: 'housing', type: 'wholeNumber' },
      { field: prefix + '50PercentWeeks', id: idPrefix + '50-percent-weeks', label: '50% allowable for (weeks)', tab: 'housing', type: 'wholeNumber' }
    ]
  }

  // -------------------------------------------------------------------------
  // CHECKS THAT INVOLVE MORE THAN ONE FIELD
  // -------------------------------------------------------------------------
  //
  // Judgement calls made from what the pages already say. All three forms
  // carry the same wording, so all three get the same three checks. Each one
  // is separate - delete any you disagree with without breaking the rest.
  //
  // Return null when there is no problem, or { id, tab, message }.
  //
  function housingChecks (prefix, idPrefix) {
    const individual = [prefix + 'Interest', prefix + 'GroundRent', prefix + 'OtherCosts']
    const totals = [prefix + 'YearlyTotal', prefix + 'WeeklyTotalHousing']

    return [
      // The page says "You can enter a yearly or weekly total instead of the
      // individual costs above." Entering both is contradictory, and OpCalc
      // would have to silently pick one.
      function (value) {
        const anyIndividual = individual.some(function (f) { return value(f) !== '' })
        const anyTotal = totals.some(function (f) { return value(f) !== '' })

        if (anyIndividual && anyTotal) {
          return {
            id: idPrefix + 'yearly-total',
            tab: 'housing',
            message: 'Enter either the individual housing costs or a total, not both'
          }
        }
        return null
      },

      // Same reasoning one level down - a yearly total and a weekly total are
      // two answers to the same question.
      function (value) {
        if (value(prefix + 'YearlyTotal') !== '' && value(prefix + 'WeeklyTotalHousing') !== '') {
          return {
            id: idPrefix + 'weekly-total-housing',
            tab: 'housing',
            message: 'Enter either a yearly total or a weekly total, not both'
          }
        }
        return null
      },

      // Housing costs without a start date cannot be apportioned into weeks.
      function (value) {
        const anyCost = individual.concat(totals).some(function (f) { return value(f) !== '' })
        const noDate = !value(prefix + 'FirstDayEntitlement-day') &&
                       !value(prefix + 'FirstDayEntitlement-month') &&
                       !value(prefix + 'FirstDayEntitlement-year')

        if (anyCost && noDate) {
          return {
            id: idPrefix + 'first-day-entitlement',
            tab: 'housing',
            message: 'Enter the first day of entitlement'
          }
        }
        return null
      }
    ]
  }

  // -------------------------------------------------------------------------
  // THE THREE A14 FORMS
  // -------------------------------------------------------------------------
  //
  // Keyed by what is written on the Generate button as data-a14-generate.
  //
  const FORMS = {
    // ---- Income Support / Pension Credit -----------------------------------
    pcispc: {
      rules: [
        {
          field: 'a14StandardAmount',
          id: 'a14-standard-amount',
          label: 'Standard amount',
          tab: 'customer',
          type: 'money',
          // The Rate select offers Standard or Manual, and the hint says the
          // amount is worked out for you unless Manual is chosen. So Manual
          // with no amount is an unfinished answer.
          requiredWhen: function (value) { return value('a14StandardRate') === 'manual' },
          missingMessage: 'Enter the standard amount'
        },
        {
          field: 'a14PartnerDob',
          id: 'a14-partner-dob',
          label: "Partner's date of birth",
          tab: 'customer',
          type: 'date',
          mustBePast: true,
          requiredWhen: function (value) { return value('a14StandardAmountType') === 'couple' },
          missingMessage: "Enter the partner's date of birth"
        },
        { field: 'a14ClericalComponents', id: 'a14-clerical-components', label: 'Clerical components', tab: 'customer', type: 'money' },
        { field: 'a14TotalCapital', id: 'a14-total-capital', label: 'Total capital', tab: 'income', type: 'money' }
      ].concat(housingRules('a14', 'a14-')),
      checks: housingChecks('a14', 'a14-')
    },

    // ---- Employment and Support Allowance -----------------------------------
    esa: {
      rules: [
        {
          field: 'esaPersonalAllowance',
          id: 'esa-personal-allowance',
          label: 'Personal allowance amount',
          tab: 'customer',
          type: 'money',
          requiredWhen: function (value) { return value('esaAgeBand') === 'manual' },
          missingMessage: 'Enter the personal allowance amount'
        },
        { field: 'esaClericalComponents', id: 'esa-clerical-components', label: 'Clerical components', tab: 'customer', type: 'money' },
        { field: 'esaTotalCapital', id: 'esa-total-capital', label: 'Total capital', tab: 'income', type: 'money' }
      ].concat(housingRules('esa', 'esa-')),
      checks: housingChecks('esa', 'esa-')
    },

    // ---- Income Support / Jobseeker's Allowance -----------------------------
    isjsa: {
      rules: [
        {
          field: 'isjsaPersonalAllowance',
          id: 'isjsa-personal-allowance',
          label: 'Personal allowance amount',
          tab: 'customer',
          type: 'money',
          requiredWhen: function (value) { return value('isjsaAgeBand') === 'manual' },
          missingMessage: 'Enter the personal allowance amount'
        },
        { field: 'isjsaClericalComponents', id: 'isjsa-clerical-components', label: 'Clerical components', tab: 'customer', type: 'money' },
        {
          field: 'isjsaCgPremiumReason',
          id: 'isjsa-cg-premium-reason',
          label: 'Reason for MIG or disability premium',
          tab: 'cg-premium',
          type: 'text',
          // The field is literally labelled "Reason for MIG or disability
          // premium", so ticking one of those two and leaving it blank is an
          // unfinished answer. The other premiums do not ask for a reason.
          requiredWhen: function (value, values) {
            const ticked = values('isjsaCgPremium')
            return ticked.indexOf('minimumIncomeGuarantee') !== -1 || ticked.indexOf('disability') !== -1
          },
          missingMessage: 'Enter a reason for the MIG or disability premium'
        },
        { field: 'isjsaTotalCapital', id: 'isjsa-total-capital', label: 'Total capital', tab: 'income', type: 'money' }
      ].concat(housingRules('isjsa', 'isjsa-')),
      checks: housingChecks('isjsa', 'isjsa-')
    }
  }

  // =========================================================================
  // THE SUB-PAGES
  // =========================================================================
  //
  // There are a lot of these - a New and a Select New page for benefit weeks,
  // exclusions, benefits, other income, dependants and non-dependants, across
  // three benefit types. Listing every field on every one of them by hand
  // would be a long job and a longer one to keep right.
  //
  // So these are not listed. The rules are read off the page instead, from the
  // things the markup already says without ambiguity:
  //
  //   a date input        must be a real date. GOV.UK only uses the date input
  //                       component for dates, so this is never a guess
  //   a £ prefix          must be an amount of money, and not negative
  //   a % suffix          must be a number between 0 and 100
  //   inputmode numeric   must be a whole number
  //
  // Nothing else is checked, because nothing else on the page says what it
  // wants. A plain text box could hold anything, and guessing at it would
  // reject answers that are perfectly fine.
  //
  // The message wording comes from the field's own label, so it always matches
  // what is on screen.
  //
  // To check something the markup does not describe, put data-check on the
  // input: "money", "wholeNumber", "percent", "required", or two separated by
  // a space, as in data-check="wholeNumber required".

  // Pages are picked up by where their form posts to. Every A14 sub-page posts
  // to /return-to-tab, so that is the marker - no page needs editing.
  //
  // If one of them posts somewhere else, add data-a14-check to its <form> tag
  // and it will be picked up too.
  const SUB_PAGE_ACTION = 'return-to-tab'

  // preferLegend matters for dates. The three boxes are labelled Day, Month
  // and Year, and the question itself - "Date of change" - is the legend on
  // the fieldset around them. Reading the box's own label would produce "Day
  // must be a real date", which tells nobody anything.
  function labelFor (el, group, preferLegend) {
    const byFor = el.id ? document.querySelector('label[for="' + el.id + '"]') : null
    const legend = group ? group.querySelector('legend') : null
    const nearby = group ? group.querySelector('label') : null

    const source = preferLegend
      ? (legend || byFor || nearby)
      : (byFor || legend || nearby)

    if (!source) { return 'This answer' }

    // Take the label's own words, not any hint or error text inside it.
    return source.textContent.replace(/\s+/g, ' ').trim()
  }

  function inferRules (form) {
    const rules = []
    let counter = 0

    function ensureId (el) {
      if (!el.id) {
        counter += 1
        el.id = 'a14-check-field-' + counter
      }
      return el.id
    }

    // ---- dates -------------------------------------------------------------
    Array.prototype.forEach.call(form.querySelectorAll('.govuk-date-input'), function (dateInput, index) {
      const boxes = dateInput.querySelectorAll('input')
      if (boxes.length < 3) { return }

      const group = dateInput.closest('.govuk-form-group') || dateInput
      const parts = { day: boxes[0], month: boxes[1], year: boxes[2] }

      if (!dateInput.id) {
        counter += 1
        dateInput.id = 'a14-check-date-' + counter
      }

      rules.push({
        id: dateInput.id,
        label: labelFor(boxes[0], group, true),
        type: 'date',
        parts: parts,
        // The first date on one of these pages is what the entry is about -
        // the date of change, the date an exclusion starts. A row with no date
        // is a blank line in the table, so the first one has to be filled in.
        // Any later date, typically a "to", is left optional.
        //
        // Change index === 0 to false below if you would rather nothing was
        // compulsory.
        required: index === 0
      })
    })

    // ---- everything else ---------------------------------------------------
    Array.prototype.forEach.call(form.querySelectorAll('input, textarea'), function (el) {
      if (el.type === 'hidden' || el.type === 'radio' || el.type === 'checkbox' || el.type === 'submit') { return }
      if (el.closest('.govuk-date-input')) { return } // already covered above

      const group = el.closest('.govuk-form-group')
      const wrapper = el.closest('.govuk-input__wrapper')
      const prefix = wrapper ? wrapper.querySelector('.govuk-input__prefix') : null
      const suffix = wrapper ? wrapper.querySelector('.govuk-input__suffix') : null
      const asked = (el.getAttribute('data-check') || '').split(/\s+/).filter(Boolean)

      let type = null

      if (asked.indexOf('money') !== -1) { type = 'money' } else if (asked.indexOf('wholeNumber') !== -1) { type = 'wholeNumber' } else if (asked.indexOf('percent') !== -1) { type = 'percent' } else if (prefix && prefix.textContent.indexOf('£') !== -1) { type = 'money' } else if (suffix && suffix.textContent.indexOf('%') !== -1) { type = 'percent' } else if (el.getAttribute('inputmode') === 'numeric' || el.type === 'number') { type = 'wholeNumber' }

      const required = asked.indexOf('required') !== -1

      if (!type && !required) { return }

      rules.push({
        id: ensureId(el),
        label: labelFor(el, group),
        type: type || 'text',
        element: el,
        required: required
      })
    })

    return rules
  }

  // A form with a "from" date and a "to" date is saying something about a
  // period, and a period that ends before it starts is wrong however it was
  // typed. Only runs when both dates are complete and real.
  function inferChecks (rules) {
    const dates = rules.filter(function (rule) { return rule.type === 'date' })

    const from = dates.filter(function (rule) { return /\b(from|start)\b/i.test(rule.label) })[0]
    const to = dates.filter(function (rule) { return /\b(to|end)\b/i.test(rule.label) })[0]

    if (!from || !to || from === to) { return [] }

    return [
      function (value, values, asDate) {
        const start = asDate(from)
        const finish = asDate(to)

        if (start && finish && finish < start) {
          return {
            id: to.id,
            tab: null,
            message: to.label + ' must be the same as or after ' + from.label.charAt(0).toLowerCase() + from.label.slice(1)
          }
        }
        return null
      }
    ]
  }

  // =========================================================================
  // Nothing below here needs changing to cover another form or sub-page.
  // =========================================================================

  function setUpChecks (form, RULES, CROSS_CHECKS, trigger, triggerEvent) {
    const originalTitle = document.title
    const hasTabs = !!form.querySelector('.govuk-tabs')

    // ---- reading the form --------------------------------------------------

    function value (name) {
      const all = form.querySelectorAll('[name="' + name + '"]')
      if (!all.length) { return '' }

      if (all[0].type === 'radio' || all[0].type === 'checkbox') {
        const checked = form.querySelector('[name="' + name + '"]:checked')
        return checked ? checked.value : ''
      }

      return (all[0].value || '').trim()
    }

    // Checkboxes can have several answers at once, and value() only reports
    // the first. This gives all of them.
    function values (name) {
      return Array.prototype.map.call(
        form.querySelectorAll('[name="' + name + '"]:checked'),
        function (el) { return el.value }
      )
    }

    // A rule found by reading the page holds its own boxes; one written out by
    // hand names them. Either way this returns what is in them.
    function part (rule, which) {
      if (rule.parts) { return (rule.parts[which].value || '').trim() }
      return value(rule.field + '-' + which)
    }

    function raw (rule) {
      if (rule.element) { return (rule.element.value || '').trim() }
      return value(rule.field)
    }

    // ---- the individual checks ---------------------------------------------

    function checkMoney (text, label) {
      // £ signs, commas and spaces are how people write money, so accept them
      // and check what is left rather than rejecting the whole thing.
      const cleaned = text.replace(/[£,\s]/g, '')

      if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) {
        return label + ' must be an amount of money, like 145.50'
      }
      if (parseFloat(cleaned) < 0) {
        return label + ' must not be a negative amount'
      }
      return null
    }

    function checkWholeNumber (text, label) {
      if (!/^\d+$/.test(text.replace(/[\s,]/g, ''))) {
        return label + ' must be a whole number, like 12'
      }
      return null
    }

    function checkPercent (text, label) {
      const cleaned = text.replace(/[%\s]/g, '')

      if (!/^\d+(\.\d+)?$/.test(cleaned)) {
        return label + ' must be a percentage, like 50'
      }
      if (parseFloat(cleaned) > 100) {
        return label + ' must be 100 or less'
      }
      return null
    }

    function listWords (words) {
      if (words.length === 1) { return words[0] }
      return words.slice(0, -1).join(', ') + ' and ' + words[words.length - 1]
    }

    function missingWording (rule) {
      return rule.missingMessage ||
        ('Enter ' + rule.label.charAt(0).toLowerCase() + rule.label.slice(1))
    }

    // Returns a real Date when the rule holds one, otherwise null. Used by the
    // from/to check.
    function asDate (rule) {
      const day = part(rule, 'day')
      const month = part(rule, 'month')
      const year = part(rule, 'year')

      if (!day || !month || !year) { return null }
      if (!/^\d{1,2}$/.test(day) || !/^\d{1,2}$/.test(month) || !/^\d{4}$/.test(year)) { return null }

      const made = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10))
      return made.getDate() === parseInt(day, 10) ? made : null
    }

    function checkDate (rule, required) {
      const day = part(rule, 'day')
      const month = part(rule, 'month')
      const year = part(rule, 'year')
      const filled = [day, month, year].filter(Boolean)

      if (!filled.length) {
        return required ? missingWording(rule) : null
      }

      // A partly filled date is the most common mistake, and saying which box
      // is empty is far more use than "enter a real date".
      if (filled.length < 3) {
        const missing = []
        if (!day) { missing.push('a day') }
        if (!month) { missing.push('a month') }
        if (!year) { missing.push('a year') }
        return rule.label + ' must include ' + listWords(missing)
      }

      if (!/^\d{1,2}$/.test(day) || !/^\d{1,2}$/.test(month) || !/^\d{4}$/.test(year)) {
        return rule.label + ' must be a real date'
      }

      const d = parseInt(day, 10)
      const m = parseInt(month, 10)
      const y = parseInt(year, 10)

      // Checks the day exists in that month, so 31/02 and 30/02 are caught.
      const made = new Date(y, m - 1, d)
      if (m < 1 || m > 12 || d < 1 || made.getDate() !== d || made.getMonth() !== m - 1 || made.getFullYear() !== y) {
        return rule.label + ' must be a real date'
      }

      if (y < 1900) {
        return rule.label + ' must be a real date'
      }

      if (rule.mustBePast) {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        if (made > today) {
          return rule.label + ' must be in the past'
        }
      }

      return null
    }

    function problemsFor (rule) {
      const required = rule.requiredWhen ? rule.requiredWhen(value, values) : !!rule.required

      if (rule.type === 'date') { return checkDate(rule, required) }

      const text = raw(rule)

      if (text === '') {
        return required ? missingWording(rule) : null
      }

      if (rule.type === 'money') { return checkMoney(text, rule.label) }
      if (rule.type === 'wholeNumber') { return checkWholeNumber(text, rule.label) }
      if (rule.type === 'percent') { return checkPercent(text, rule.label) }

      // type 'text' - there is no wrong way to write a sentence, so once it
      // has been filled in there is nothing left to check.
      return null
    }

    function tabIds () {
      return Array.prototype.map.call(
        form.querySelectorAll('.govuk-tabs__tab'),
        function (tab) { return (tab.getAttribute('href') || '').replace('#', '') }
      )
    }

    function fieldOrder (id) {
      const all = Array.prototype.slice.call(form.querySelectorAll('[id]'))
      const el = document.getElementById(id)
      return el ? all.indexOf(el) : 0
    }

    function findProblems () {
      const found = []

      RULES.forEach(function (rule) {
        const message = problemsFor(rule)
        if (message) {
          found.push({ id: rule.id, tab: rule.tab || null, message: message })
        }
      })

      CROSS_CHECKS.forEach(function (check) {
        const result = check(value, values, asDate)
        // Only one message per field, so a field already flagged for its
        // format is not also flagged for a rule about the pair it belongs to.
        if (result && !found.some(function (p) { return p.id === result.id })) {
          found.push(result)
        }
      })

      // The summary has to run in the order the fields appear on the page, or
      // the list reads as random. Tab order first, then order within the tab.
      const order = tabIds()
      found.sort(function (a, b) {
        const byTab = order.indexOf(a.tab) - order.indexOf(b.tab)
        if (byTab !== 0) { return byTab }
        return fieldOrder(a.id) - fieldOrder(b.id)
      })

      return found
    }

    // ---- showing them ------------------------------------------------------

    function groupFor (id) {
      const el = document.getElementById(id)
      return el ? el.closest('.govuk-form-group') : null
    }

    function clearErrors () {
      document.title = originalTitle

      const summary = document.getElementById('a14-error-summary')
      if (summary) { summary.parentNode.removeChild(summary) }

      Array.prototype.forEach.call(document.querySelectorAll('.govuk-error-message[data-a14-error]'), function (el) {
        el.parentNode.removeChild(el)
      })

      Array.prototype.forEach.call(document.querySelectorAll('.govuk-form-group--error'), function (el) {
        el.classList.remove('govuk-form-group--error')
      })

      Array.prototype.forEach.call(document.querySelectorAll('.govuk-input--error, .govuk-select--error, .govuk-textarea--error'), function (el) {
        el.classList.remove('govuk-input--error', 'govuk-select--error', 'govuk-textarea--error')
      })

      // Put the tab labels back the way they were.
      Array.prototype.forEach.call(form.querySelectorAll('.govuk-tabs__tab'), function (tab) {
        if (tab.getAttribute('data-a14-label')) {
          tab.textContent = tab.getAttribute('data-a14-label')
        }
      })
    }

    function showFieldError (problem) {
      const group = groupFor(problem.id)
      if (!group) { return }

      group.classList.add('govuk-form-group--error')

      const message = document.createElement('p')
      message.className = 'govuk-error-message'
      message.id = problem.id + '-error'
      message.setAttribute('data-a14-error', 'true')
      message.innerHTML = '<span class="govuk-visually-hidden">Error:</span> '
      message.appendChild(document.createTextNode(problem.message))

      // Goes after the label and hint, immediately before the input itself -
      // which for a prefixed field is the wrapper, and for a date is the group
      // of three boxes.
      const anchor = group.querySelector(
        '.govuk-input__wrapper, .govuk-date-input, .govuk-radios, .govuk-checkboxes, .govuk-select, .govuk-input, .govuk-textarea'
      )

      // Inserted next to the anchor rather than into the form group, because a
      // date or a set of radios sits inside a fieldset - so the boxes are a
      // grandchild of the group, and the message has to go in beside them.
      if (anchor && anchor.parentNode) {
        anchor.parentNode.insertBefore(message, anchor)
      } else {
        group.appendChild(message)
      }

      Array.prototype.forEach.call(group.querySelectorAll('.govuk-input, .govuk-select, .govuk-textarea'), function (input) {
        if (input.tagName === 'SELECT') {
          input.classList.add('govuk-select--error')
        } else if (input.tagName === 'TEXTAREA') {
          input.classList.add('govuk-textarea--error')
        } else {
          input.classList.add('govuk-input--error')
        }

        const described = (input.getAttribute('aria-describedby') || '').split(' ').filter(Boolean)
        if (described.indexOf(message.id) === -1) {
          described.push(message.id)
          input.setAttribute('aria-describedby', described.join(' '))
        }
      })
    }

    function countTabs (problems) {
      if (!hasTabs) { return }

      const counts = {}
      problems.forEach(function (p) { counts[p.tab] = (counts[p.tab] || 0) + 1 })

      Array.prototype.forEach.call(form.querySelectorAll('.govuk-tabs__tab'), function (tab) {
        const id = (tab.getAttribute('href') || '').replace('#', '')

        if (!tab.getAttribute('data-a14-label')) {
          tab.setAttribute('data-a14-label', tab.textContent.trim())
        }

        const base = tab.getAttribute('data-a14-label')
        const count = counts[id]

        // Six tabs and one summary at the top is a lot of scrolling to work
        // out where the trouble is. The count says it on the tab itself.
        tab.textContent = count
          ? base + ' (' + count + (count === 1 ? ' problem)' : ' problems)')
          : base
      })
    }

    function openTab (id) {
      if (!hasTabs || !id) { return }
      const tab = form.querySelector('.govuk-tabs__tab[href="#' + id + '"]')
      if (tab) { tab.click() }
    }

    function focusField (id) {
      const el = document.getElementById(id)
      if (!el) { return }

      // A date input's id is on the wrapper, so aim at the first of its boxes.
      const target = el.tagName === 'DIV' ? el.querySelector('input, select, textarea') : el
      if (!target) { return }

      target.focus()

      const group = target.closest('.govuk-form-group')
      if (group && group.scrollIntoView) {
        group.scrollIntoView({ block: 'center' })
      }
    }

    // The tab's own wording, without any count that has been added to it.
    function tabName (id) {
      const tab = form.querySelector('.govuk-tabs__tab[href="#' + id + '"]')
      if (!tab) { return '' }
      return tab.getAttribute('data-a14-label') || tab.textContent.trim()
    }

    // A flat list of problems is fine on a sub-page, where everything is
    // visible at once. On an A14 form a field can be on a tab that is not
    // showing, so the list is grouped under the tab each problem is on.
    //
    // The link text stays exactly the message shown next to the field, which
    // the Design System asks for - the tab name is a heading around the group
    // rather than part of the message.
    function groupByTab (problems) {
      if (!hasTabs) { return [{ id: null, name: '', problems: problems }] }

      const groups = []
      const ids = tabIds()

      ids.forEach(function (id) {
        const mine = problems.filter(function (p) { return p.tab === id })
        if (mine.length) {
          groups.push({ id: id, name: tabName(id), problems: mine })
        }
      })

      const loose = problems.filter(function (p) { return ids.indexOf(p.tab) === -1 })
      if (loose.length) {
        groups.push({ id: null, name: '', problems: loose })
      }

      return groups
    }

    function summaryList (problems) {
      const list = document.createElement('ul')
      list.className = 'govuk-list govuk-error-summary__list'

      problems.forEach(function (problem) {
        const item = document.createElement('li')
        const link = document.createElement('a')

        link.setAttribute('href', '#' + problem.id)
        link.textContent = problem.message

        // The field may be on a tab that is not showing, so open it first.
        // Without this the link jumps to a hidden element and appears to do
        // nothing at all.
        link.addEventListener('click', function (event) {
          event.preventDefault()
          openTab(problem.tab)
          focusField(problem.id)
        })

        item.appendChild(link)
        list.appendChild(item)
      })

      return list
    }

    // quiet = true rebuilds the summary in place without grabbing focus or
    // scrolling, which is what you want when someone has just corrected a
    // field and is still working further down the page.
    function showSummary (problems, quiet) {
      const summary = document.createElement('div')
      summary.className = 'govuk-error-summary'
      summary.id = 'a14-error-summary'
      summary.setAttribute('data-module', 'govuk-error-summary')
      summary.setAttribute('tabindex', '-1')

      const alert = document.createElement('div')
      alert.setAttribute('role', 'alert')

      const heading = document.createElement('h2')
      heading.className = 'govuk-error-summary__title'
      heading.textContent = 'There is a problem'

      const body = document.createElement('div')
      body.className = 'govuk-error-summary__body'

      const groups = groupByTab(problems)

      // One sentence saying how much there is and roughly where, so the shape
      // of the job is clear before reading any of it.
      if (groups.length > 1) {
        const intro = document.createElement('p')
        intro.className = 'govuk-body govuk-!-margin-bottom-3'
        intro.textContent = problems.length + ' problems across ' + groups.length +
          ' tabs. Select a problem to go straight to it.'
        body.appendChild(intro)
      }

      groups.forEach(function (group, index) {
        if (group.name) {
          const label = document.createElement('h3')
          label.className = 'govuk-heading-s govuk-!-margin-bottom-1'
          label.textContent = group.name + ' tab' +
            ' (' + group.problems.length + (group.problems.length === 1 ? ' problem)' : ' problems)')
          body.appendChild(label)
        }

        const list = summaryList(group.problems)
        if (index < groups.length - 1) {
          list.className += ' govuk-!-margin-bottom-4'
        }
        body.appendChild(list)
      })

      alert.appendChild(heading)
      alert.appendChild(body)
      summary.appendChild(alert)

      // Top of the main container, above the h1 - where the Design System puts
      // it, and where a screen reader will reach it first.
      const heading1 = document.querySelector('main h1') || document.querySelector('h1')

      if (heading1 && heading1.parentNode) {
        heading1.parentNode.insertBefore(summary, heading1)
      } else {
        const main = document.querySelector('main')
        if (main) { main.insertBefore(summary, main.firstChild) }
      }

      if (!quiet) {
        summary.focus()
        if (summary.scrollIntoView) { summary.scrollIntoView({ block: 'start' }) }
      }
    }

    // ---- the way out -------------------------------------------------------

    function render (problems, quiet) {
      clearErrors()

      if (!problems.length) { return }

      document.title = 'Error: ' + originalTitle

      problems.forEach(showFieldError)
      countTabs(problems)

      if (!quiet) {
        // Open the tab holding the first problem, so the page is showing
        // something that is actually wrong rather than whichever tab happened
        // to be open. Skipped when quiet, or correcting one field would drag
        // you away to another tab mid-sentence.
        openTab(problems[0].tab)
      }

      showSummary(problems, quiet)
    }

    trigger.addEventListener(triggerEvent, function (event) {
      const problems = findProblems()

      if (!problems.length) {
        clearErrors()
        return // let the button or the form do what it normally does
      }

      event.preventDefault()
      render(problems, false)
    })

    // Telling someone they are wrong and then giving no sign when they have
    // put it right is the part people find most annoying about form errors.
    //
    // This only ever runs once errors are already on screen, and only on
    // change - when a field is left, or a radio picked - never while typing.
    // That is the line the Design System draws: do not check as someone types,
    // but do acknowledge a fix.
    //
    // Delete this block if you would rather nothing moved until the button is
    // pressed again.
    form.addEventListener('change', function () {
      if (!document.getElementById('a14-error-summary')) { return }
      render(findProblems(), true)
    })
  }

  // -------------------------------------------------------------------------
  // Working out which kind of page this is
  // -------------------------------------------------------------------------

  const tabbedForm = document.querySelector('form .govuk-tabs')
    ? document.querySelector('form .govuk-tabs').closest('form')
    : null

  const generate = document.querySelector('[data-a14-generate]')

  if (tabbedForm && generate) {
    // Which of the three A14 forms this is. Normally it is written on the
    // button as data-a14-generate="esa". If that is missing or misspelt, work
    // it out from which fields are actually on the page - so a typo degrades
    // into the right answer rather than into no checking at all.
    const named = generate.getAttribute('data-a14-generate')
    let chosen = FORMS[named] || null

    if (!chosen) {
      const keys = Object.keys(FORMS)

      for (let i = 0; i < keys.length; i++) {
        if (tabbedForm.querySelector('[name="' + FORMS[keys[i]].rules[0].field + '"]')) {
          chosen = FORMS[keys[i]]
          window.console.log('A14 checks: data-a14-generate="' + named +
            '" is not one of ' + keys.join(', ') + '. Using "' + keys[i] +
            '", worked out from the fields on this page.')
          break
        }
      }
    }

    if (chosen) {
      setUpChecks(tabbedForm, chosen.rules, chosen.checks, generate, 'click')
    } else {
      window.console.log('A14 checks: this page has no fields matching any form in FORMS, so nothing is being checked.')
    }

    return
  }

  // A sub-page. Every one of them posts to /return-to-tab.
  const subForms = Array.prototype.filter.call(
    document.querySelectorAll('form'),
    function (form) {
      return form.hasAttribute('data-a14-check') ||
        (form.getAttribute('action') || '').indexOf(SUB_PAGE_ACTION) !== -1
    }
  )

  subForms.forEach(function (form) {
    const rules = inferRules(form)

    if (!rules.length) { return }

    window.console.log('A14 checks: watching ' + rules.length + ' field(s) on this page - ' +
      rules.map(function (r) { return r.label + ' (' + r.type + (r.required ? ', needed' : '') + ')' }).join(', '))

    setUpChecks(form, rules, inferChecks(rules), form, 'submit')
  })
})
