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
//
// One save at a time, and never at the same moment as the next page.
// The Prototype Kit keeps each person's answers in a file. If two requests
// write that file at once, the kit can read it half written, decide it is
// broken and throw it away, losing everything entered for the case. The old
// version saved in the background while the browser was already loading the
// next page, and testing showed this wiping the case about one time in two.
// So now saves queue up one behind another, links wait for the last save to
// finish before leaving, and a form waits too before it is sent.

window.GOVUKPrototypeKit.documentReady(() => {
  const tabs = document.querySelector('form .govuk-tabs')
  const form = tabs ? tabs.closest('form') : null

  if (!form) {
    return
  }

  let pending = null
  let queue = Promise.resolve()
  let busy = 0

  function save () {
    const body = new URLSearchParams(new FormData(form)).toString()
    busy++

    queue = queue
      .then(function () {
        return window.fetch('/a14-autosave', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          credentials: 'same-origin',
          body: body
        })
      })
      .catch(function () {
        // Saving is a convenience. If it fails the form still works
        // normally, so there is nothing worth interrupting anyone for.
      })
      .then(function () { busy-- })

    return queue
  }

  // Never wait more than 3 seconds, so a slow save cannot trap anyone on
  // the page.
  function saved () {
    return Promise.race([queue, new Promise(function (resolve) { window.setTimeout(resolve, 3000) })])
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
  // back link, anything. Tab links are ignored, since they stay put. The
  // link waits until the save has finished, then goes.
  document.addEventListener('click', function (event) {
    if (!event.target || !event.target.closest) { return }
    if (event.defaultPrevented || event.button !== 0) { return }
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) { return }

    const link = event.target.closest('a[href]')
    if (!link || link.target === '_blank' || link.hasAttribute('download')) { return }

    const href = link.getAttribute('href') || ''

    if (href.charAt(0) === '#' || href.indexOf('javascript:') === 0) { return }

    event.preventDefault()
    window.clearTimeout(pending)
    save()
    saved().then(function () { window.location.href = link.href })
  })

  // Pressing a button that sends the form sends every field anyway, so any
  // save still waiting is dropped. If one is already on its way, the form
  // waits for it and then sends itself.
  form.addEventListener('submit', function (event) {
    window.clearTimeout(pending)

    if (busy > 0) {
      event.preventDefault()
      event.stopImmediatePropagation()

      const submitter = event.submitter

      saved().then(function () {
        if (form.requestSubmit) {
          form.requestSubmit(submitter && submitter.form === form ? submitter : undefined)
        } else {
          form.submit()
        }
      })
    }
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

// ===========================================================================
// 3. Small helpers added after the user research round (October 2026)
// ===========================================================================
//
// Each one only switches on where a page asks for it with a data attribute,
// so nothing changes on pages that do not use them.

window.GOVUKPrototypeKit.documentReady(() => {
  const DAY_MS = 24 * 60 * 60 * 1000
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December']

  // The three boxes of a GOV.UK date input, read as a real date or null.
  function readDate (container) {
    if (!container) { return null }
    const boxes = container.querySelectorAll('input')
    if (boxes.length < 3) { return null }
    const d = parseInt(boxes[0].value, 10)
    const m = parseInt(boxes[1].value, 10)
    const y = parseInt(boxes[2].value, 10)
    if (!d || !m || !y || String(y).length !== 4) { return null }
    const made = new Date(Date.UTC(y, m - 1, d))
    if (made.getUTCDate() !== d || made.getUTCMonth() !== m - 1) { return null }
    return made
  }

  function writeDate (container, date) {
    const boxes = container.querySelectorAll('input')
    boxes[0].value = date.getUTCDate()
    boxes[1].value = date.getUTCMonth() + 1
    boxes[2].value = date.getUTCFullYear()
    boxes[0].dispatchEvent(new Event('input', { bubbles: true }))
  }

  function longDate (date) {
    return WEEKDAYS[date.getUTCDay()] + ' ' + date.getUTCDate() + ' ' +
      MONTHS[date.getUTCMonth()] + ' ' + date.getUTCFullYear()
  }

  // ---- Day of the week under a date ---------------------------------------
  // Lynn and David check the day of the week as they type a date, because a
  // benefit date on the wrong weekday means the date is wrong. OpCalc shows
  // it today. Put data-weekday="true" on a govukDateInput to switch it on.
  document.querySelectorAll('.govuk-date-input[data-weekday]').forEach(function (container) {
    const note = document.createElement('p')
    note.className = 'govuk-hint govuk-!-margin-top-2 govuk-!-margin-bottom-0 opcalc-weekday'
    note.setAttribute('aria-live', 'polite')
    container.insertAdjacentElement('afterend', note)

    function update () {
      const date = readDate(container)
      note.textContent = date ? longDate(date) : ''
    }

    container.addEventListener('input', update)
    update()
  })

  // ---- Length of a period ---------------------------------------------------
  // "It should be for pension credit weekly paid benefits, so it should always
  // be weeks and not days" - Lynn. Leftover days are the clue that a date is
  // wrong. Counts both the first and last day, as OpCalc does.
  document.querySelectorAll('[data-period-from][data-period-to]').forEach(function (summary) {
    const from = document.getElementById(summary.getAttribute('data-period-from'))
    const to = document.getElementById(summary.getAttribute('data-period-to'))
    if (!from || !to) { return }

    function update () {
      const start = readDate(from)
      const end = readDate(to)

      if (!start || !end) { summary.textContent = ''; return }
      if (end < start) { summary.textContent = 'The end date is before the start date'; return }

      const days = Math.round((end - start) / DAY_MS) + 1
      const weeks = Math.floor(days / 7)
      const rest = days % 7

      summary.textContent = 'Period: ' + weeks + (weeks === 1 ? ' week' : ' weeks') +
        (rest ? ' and ' + rest + (rest === 1 ? ' day' : ' days') : '')
    }

    from.addEventListener('input', update)
    to.addEventListener('input', update)
    update()
  })

  // ---- Move a date on by a week ----------------------------------------------
  // Joanne enters a balance for every week and moves the date on with the up
  // arrow in OpCalc, 7 presses at a time. These buttons do it in one.
  document.querySelectorAll('[data-date-step][data-date-target]').forEach(function (button) {
    button.addEventListener('click', function (event) {
      event.preventDefault()
      const container = document.getElementById(button.getAttribute('data-date-target'))
      const date = readDate(container)
      if (!date) { return }
      const step = parseInt(button.getAttribute('data-date-step'), 10) || 0
      writeDate(container, new Date(date.getTime() + step * DAY_MS))
    })
  })

  // ---- Type a code, pick the list item -----------------------------------------
  // Users know the benefit, asset and exclusion numbers and type them rather
  // than scroll a list. Put data-code-lookup="id-of-select" on the box, and
  // data-code="15" on the matching option. Typing a code the list does not
  // know leaves the list alone.
  document.querySelectorAll('[data-code-lookup]').forEach(function (input) {
    const select = document.getElementById(input.getAttribute('data-code-lookup'))
    if (!select) { return }

    input.addEventListener('input', function () {
      const code = input.value.trim()
      if (!code) { return }
      const match = select.querySelector('option[data-code="' + code.replace(/"/g, '') + '"]')
      if (match) {
        select.value = match.value
        select.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })
  })

  // Hide or show a row. GOV.UK styles give summary list rows and radio items
  // their own display value, which beats the plain hidden attribute, so the
  // GOV.UK "display none" class is set as well.
  function hide (el, hidden) {
    el.hidden = hidden
    el.classList.toggle('govuk-!-display-none', hidden)
  }

  // ---- Find a case by National Insurance number -------------------------------
  // Saved and importable cases are sorted by National Insurance number and
  // the lists are long (Lynn keeps 200 to 300, David's import list holds
  // 18,487). Type part of the number to narrow the list.
  //
  // The list is any element with an id, holding rows marked data-nino.
  // Optional extras, all keyed off the list's id:
  //   radios with data-source-filter="<id>"  show only internal or external
  //   data-page-size="25" on the list        split into pages
  //   #<id>-count, #<id>-none, #<id>-pages   count, empty message, page links
  document.querySelectorAll('[data-case-list]').forEach(function (list) {
    const id = list.id
    const rows = Array.prototype.slice.call(list.querySelectorAll('[data-nino]'))
    const search = document.querySelector('input[type="search"][aria-controls="' + id + '"]')
    const sources = document.querySelectorAll('input[type="radio"][data-source-filter="' + id + '"]')
    const count = document.getElementById(id + '-count')
    const none = document.getElementById(id + '-none')
    const pages = document.getElementById(id + '-pages')
    const pageSize = parseInt(list.getAttribute('data-page-size'), 10) || 0
    const noun = list.getAttribute('data-noun') || 'cases'
    let page = 1

    function source () {
      let chosen = 'all'
      sources.forEach(function (r) { if (r.checked) { chosen = r.value } })
      return chosen
    }

    function pageLink (label, number, extra) {
      const li = document.createElement('li')
      li.className = 'govuk-pagination__item' + (number === page ? ' govuk-pagination__item--current' : '')
      const a = document.createElement('a')
      a.className = 'govuk-link govuk-pagination__link'
      a.href = '#' + id
      a.textContent = label
      a.setAttribute('aria-label', extra || 'Page ' + number)
      if (number === page) { a.setAttribute('aria-current', 'page') }
      a.addEventListener('click', function (event) {
        event.preventDefault()
        page = number
        apply()
        list.scrollIntoView()
      })
      li.appendChild(a)
      return li
    }

    function apply () {
      const wanted = search ? search.value.replace(/\s+/g, '').toUpperCase() : ''
      const from = source()
      const matching = rows.filter(function (row) {
        const ninoOk = !wanted || row.getAttribute('data-nino').toUpperCase().indexOf(wanted) !== -1
        const sourceOk = from === 'all' || row.getAttribute('data-source') === from
        return ninoOk && sourceOk
      })

      const totalPages = pageSize ? Math.max(1, Math.ceil(matching.length / pageSize)) : 1
      if (page > totalPages) { page = totalPages }

      rows.forEach(function (row) { hide(row, true) })
      matching.forEach(function (row, i) {
        hide(row, pageSize ? Math.floor(i / pageSize) + 1 !== page : false)
      })

      if (count) {
        let text = matching.length + ' ' + (matching.length === 1 ? noun.replace(/s$/, '') : noun)
        if (wanted) { text += ' match "' + search.value.trim() + '"' }
        if (pageSize && totalPages > 1) {
          text += '. Showing ' + (Math.min((page - 1) * pageSize + 1, matching.length)) + ' to ' + Math.min(page * pageSize, matching.length)
        }
        count.textContent = text + '.'
      }
      if (none) { none.classList.toggle('govuk-!-display-none', matching.length !== 0) }

      if (pages) {
        pages.replaceChildren()
        pages.hidden = totalPages < 2
        if (totalPages > 1) {
          const ul = document.createElement('ul')
          ul.className = 'govuk-pagination__list'
          for (let n = 1; n <= totalPages; n++) { ul.appendChild(pageLink(String(n), n)) }
          pages.appendChild(ul)
        }
      }
    }

    if (search) { search.addEventListener('input', function () { page = 1; apply() }) }
    sources.forEach(function (r) { r.addEventListener('change', function () { page = 1; apply() }) })
    apply()
  })

  // ---- Copy a table for Excel -------------------------------------------------
  // David finishes each case by copying the QB16 schedule (Form, Copy
  // schedule) and pasting it into his team's Excel workbook.
  // This copies the table as tab separated rows, which Excel pastes into
  // cells.
  document.querySelectorAll('[data-copy-table]').forEach(function (button) {
    const table = document.getElementById(button.getAttribute('data-copy-table'))
    const status = document.getElementById(button.getAttribute('data-copy-status'))
    if (!table) { return }

    button.addEventListener('click', function () {
      const text = Array.prototype.map.call(table.querySelectorAll('tr'), function (row) {
        return Array.prototype.map.call(row.querySelectorAll('th, td'), function (cell) {
          return cell.textContent.replace(/\s+/g, ' ').trim()
        }).join('\t')
      }).join('\n')

      function done (ok) {
        if (status) {
          status.textContent = ok
            ? 'Schedule copied. You can now paste it into Excel.'
            : 'The schedule could not be copied. Select the table and copy it instead.'
        }
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true) }, function () { done(false) })
      } else {
        done(false)
      }
    })
  })

  // ---- Clear this page --------------------------------------------------------
  // Clear used to be a second submit button, so pressing it moved on to the
  // next page. Nobody we spoke to had used it, so it is now a link that only
  // empties the boxes on the page.
  document.querySelectorAll('.js-clear-form').forEach(function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault()
      const form = link.closest('form')
      if (!form) { return }
      form.querySelectorAll('input, select, textarea').forEach(function (field) {
        if (field.type === 'hidden' || field.type === 'submit') { return }
        if (field.type === 'radio' || field.type === 'checkbox') {
          field.checked = false
        } else if (field.tagName === 'SELECT') {
          field.selectedIndex = 0
        } else {
          field.value = ''
        }
      })
      const first = form.querySelector('input:not([type="hidden"]), select, textarea')
      if (first) { first.focus() }
    })
  })
})
