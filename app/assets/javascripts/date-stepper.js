// Date stepper, from the team's CASA build (shared 9 Oct 2026), copied as
// given, with one change (see step below). Goes with
// app/views/components/date-stepper.njk.
const parseDate = (day, month, year) => {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);

  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)) {
    return null;
  }

  const date = new Date(y, m - 1, d);

  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return null;
  }

  return date;
};

const formatDate = (date) => date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const formatPeriod = (fromDate, toDate) => {
  if (!fromDate || !toDate || toDate <= fromDate) return '';
  const totalDays = Math.round((toDate - fromDate) / (1000 * 60 * 60 * 24));
  const weeks = Math.floor(totalDays / 7);
  const days = totalDays % 7;
  const parts = [];
  if (weeks > 0) parts.push(`${weeks} week${weeks !== 1 ? 's' : ''}`);
  if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
  return parts.length ? `Period: ${parts.join(' and ')}` : '';
};

const updatePeriod = () => {
  const periodEl = document.querySelector('[data-period]');
  if (!periodEl) return;
  const steppers = document.querySelectorAll('[data-module="date-stepper"]');
  if (steppers.length < 2) return;
  const getDate = (stepper) => {
    const d = stepper.querySelector('[data-date-part="day"]');
    const m = stepper.querySelector('[data-date-part="month"]');
    const y = stepper.querySelector('[data-date-part="year"]');
    return d && m && y ? parseDate(d.value, m.value, y.value) : null;
  };
  periodEl.textContent = formatPeriod(getDate(steppers[0]), getDate(steppers[1]));
};

const initDateStepper = (root) => {
  const day = root.querySelector('[data-date-part="day"]');
  const month = root.querySelector('[data-date-part="month"]');
  const year = root.querySelector('[data-date-part="year"]');
  const label = root.querySelector('[data-weekday]');

  if (!day || !month || !year || !label) {
    return;
  }

  const currentDate = () => parseDate(day.value, month.value, year.value);

  const refresh = () => {
    const date = currentDate();
    label.textContent = date ? formatDate(date) : '';
    updatePeriod();
  };

  const step = (amount) => {
    let date = currentDate();

    // Change for OpCalc (9 Oct 2026, Maisie): the team's code did nothing
    // when the boxes were empty, so the From arrows did nothing at first.
    // Now the first click on an empty date fills in the To date (the last
    // date stepper on the page), or today if that is empty too. Later
    // clicks move it a day at a time as before.
    if (!date) {
      const steppers = document.querySelectorAll('[data-module="date-stepper"]');
      const toStepper = steppers[steppers.length - 1];
      const part = (name) => toStepper.querySelector(`[data-date-part="${name}"]`);
      const start = (toStepper !== root && parseDate(part('day').value, part('month').value, part('year').value)) || new Date();
      day.value = String(start.getDate());
      month.value = String(start.getMonth() + 1);
      year.value = String(start.getFullYear());
      refresh();
      return;
    }

    date.setDate(date.getDate() + amount);
    day.value = String(date.getDate());
    month.value = String(date.getMonth() + 1);
    year.value = String(date.getFullYear());
    refresh();
  };

  [day, month, year].forEach((input) => {
    input.addEventListener('input', refresh);
  });

  root.querySelectorAll('[data-step]').forEach((button) => {
    button.addEventListener('click', () => {
      step(Number(button.getAttribute('data-step')));
    });
  });

  refresh();
};

document.querySelectorAll('[data-module="date-stepper"]').forEach(initDateStepper);
