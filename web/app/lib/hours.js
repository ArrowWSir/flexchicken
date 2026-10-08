// "Open now" worked out in the shop's own time zone, whatever the visitor's
// phone is set to. Intl handles the GMT/BST switch.
//
// A schedule is { monday: ["12:00", "23:00"] | null, ... }. A close time at or
// before the open time means the shop closes after midnight ("12:00"–"01:00").

const TIME_ZONE = "Europe/London";

export const DAYS = Object.freeze(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
const SHORT_DAY = { monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun" };
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function londonClock(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TIME_ZONE,
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  return { day: parts.weekday.toLowerCase(), minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

const isOvernight = ([opens, closes]) => toMinutes(closes) <= toMinutes(opens);
const dayAfter = (day, n = 1) => DAYS[(DAYS.indexOf(day) + n) % 7];
const capitalise = (day) => day[0].toUpperCase() + day.slice(1);

// 23:00 -> "11pm", 12:30 -> "12:30pm"
export function speak(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return m ? `${hour}:${String(m).padStart(2, "0")}${suffix}` : `${hour}${suffix}`;
}

// The next opening after today: "tomorrow 12pm", "Friday 12pm", or null.
function nextOpening(day, schedule) {
  for (let n = 1; n <= 7; n += 1) {
    const next = dayAfter(day, n);
    const hours = schedule[next];
    if (hours) return `${n === 1 ? "tomorrow" : capitalise(next)} ${speak(hours[0])}`;
  }
  return null;
}

/**
 * @param {Date} date
 * @param {Record<string, [string, string] | null>} schedule
 * @returns {{ isOpen: boolean, label: string }}
 */
export function openStatus(date, schedule) {
  const { day, minutes } = londonClock(date);

  // Still inside last night's late opening.
  const lastNight = schedule[dayAfter(day, 6)];
  if (lastNight && isOvernight(lastNight) && minutes < toMinutes(lastNight[1])) {
    return { isOpen: true, label: `Open now · until ${speak(lastNight[1])}` };
  }

  const hours = schedule[day];
  if (!hours) {
    return DAYS.some((d) => schedule[d]) ? { isOpen: false, label: "Closed today" } : { isOpen: false, label: "Closed" };
  }
  const [opens, closes] = hours;
  if (minutes >= toMinutes(opens) && (isOvernight(hours) || minutes < toMinutes(closes))) {
    return { isOpen: true, label: `Open now · until ${speak(closes)}` };
  }
  if (minutes < toMinutes(opens)) return { isOpen: false, label: `Closed · opens ${speak(opens)}` };
  const next = nextOpening(day, schedule);
  return { isOpen: false, label: next ? `Closed · opens ${next}` : "Closed" };
}

/** A saved schedule if every day is valid, otherwise null. */
export function readSchedule(saved) {
  if (!saved || typeof saved !== "object") return null;
  const out = {};
  for (const day of DAYS) {
    const hours = saved[day];
    if (hours === null) {
      out[day] = null;
      continue;
    }
    if (!Array.isArray(hours) || hours.length !== 2 || !hours.every((t) => HHMM.test(t)) || hours[0] === hours[1]) return null;
    out[day] = [hours[0], hours[1]];
  }
  return out;
}

const rangeText = (hours) => (hours ? `${speak(hours[0])} – ${speak(hours[1])}` : "closed");

/** "Daily, 12pm – 11pm", or runs of days: "Mon–Thu 12pm – 11pm · Sun closed". */
export function hoursDisplay(schedule) {
  const texts = DAYS.map((day) => rangeText(schedule[day]));
  if (texts.every((t) => t === texts[0])) return texts[0] === "closed" ? "Closed" : `Daily, ${texts[0]}`;
  const runs = [];
  DAYS.forEach((day, i) => {
    const last = runs.at(-1);
    if (last && last.text === texts[i]) last.to = day;
    else runs.push({ from: day, to: day, text: texts[i] });
  });
  return runs
    .map(({ from, to, text }) => `${SHORT_DAY[from]}${from === to ? "" : `–${SHORT_DAY[to]}`} ${text}`)
    .join(" · ");
}
