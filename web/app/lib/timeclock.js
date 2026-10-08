// Staff clock in / clock out. Pure functions over two lists:
//   staff:  { id, code, name, role, pinHash, isActive, createdAt }
//   shifts: { id, staffId, startAt, endAt|null, closedBy|null }
// Every change returns new lists; nothing is mutated.
//
// The owner adds each person in /admin/staff with their own 3-digit Staff ID
// (`code`) and a 4-digit PIN. At /clock they type the ID, then the PIN: the ID
// says who, the PIN proves it, so two people may share a PIN.

export const STAFF_ROLES = Object.freeze({
  kitchen: "Kitchen",
  counter: "Counter",
  driver: "Driver",
  manager: "Manager",
});

const PIN = /^\d{4}$/;
export const STAFF_ID_LENGTH = 3;
// No leading zero, so "042" can never be read back as "42".
const STAFF_ID = /^[1-9]\d{2}$/;
const MIN_STAFF_ID = 100;
const FIRST_STAFF_ID = 101;
const LAST_STAFF_ID = 999;
const MAX_NAME = 40;
const MINUTE_MS = 60_000;
// A shift still open after this long probably means someone forgot to clock out.
export const LONG_SHIFT_HOURS = 14;

/**
 * Personal clock PINs identify who is clocking in; they are not passwords.
 * Stored hashed (FNV-1a) so a glance at storage does not show them.
 */
export function pinHash(pin) {
  let hash = 0x811c9dc5;
  for (const char of `fc-clock:${pin}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

export const isValidPin = (pin) => PIN.test(String(pin ?? ""));
export const isValidStaffId = (code) => STAFF_ID.test(String(code ?? ""));

/**
 * The next free Staff ID. IDs are never reused, even after someone leaves,
 * so a timesheet line always means one person.
 */
export function nextStaffId(staff) {
  const taken = new Set(staff.map((s) => s.code));
  const highest = Math.max(FIRST_STAFF_ID - 1, ...staff.filter((s) => isValidStaffId(s.code)).map((s) => Number(s.code)));
  for (let n = highest + 1; n <= LAST_STAFF_ID; n += 1) if (!taken.has(String(n))) return String(n);
  for (let n = MIN_STAFF_ID; n <= LAST_STAFF_ID; n += 1) if (!taken.has(String(n))) return String(n);
  throw new Error("Every Staff ID is in use.");
}

/**
 * Staff added before IDs existed get one, oldest first. Returns the same list
 * when nobody needs one, so saved data is only rewritten when it changes.
 */
export function withStaffIds(staff) {
  if (staff.every((s) => isValidStaffId(s.code))) return staff;
  const order = [...staff].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  let done = staff.filter((s) => isValidStaffId(s.code));
  const codes = new Map();
  for (const member of order) {
    if (isValidStaffId(member.code)) continue;
    const code = nextStaffId(done);
    codes.set(member.id, code);
    done = [...done, { ...member, code }];
  }
  return staff.map((s) => (codes.has(s.id) ? { ...s, code: codes.get(s.id) } : s));
}

function cleanName(name) {
  const clean = String(name ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_NAME);
  if (!clean) throw new Error("Enter the staff member's name.");
  return clean;
}

function checkRole(role) {
  if (!Object.hasOwn(STAFF_ROLES, role)) throw new Error("Choose a role.");
  return role;
}

// PINs need not be unique: the Staff ID picks the person. Refusing a taken
// PIN would also tell the owner someone else's PIN.
function checkPin(pin) {
  if (!isValidPin(pin)) throw new Error("The PIN must be 4 digits.");
  return pinHash(pin);
}

function checkStaffId(staff, code, ignoreId = null) {
  const clean = String(code ?? "").trim();
  if (!isValidStaffId(clean)) throw new Error("The Staff ID must be 3 digits, from 100 to 999.");
  const owner = staff.find((s) => s.code === clean && s.id !== ignoreId);
  if (owner) {
    throw new Error(owner.isActive ? `Staff ID ${clean} belongs to ${owner.name}. Pick another.` : `Staff ID ${clean} belonged to someone who has left. Pick another.`);
  }
  return clean;
}

const newId = (prefix, at, list) => `${prefix}_${at.toString(36)}${list.length.toString(36)}`;

/** `code` is the Staff ID the owner chose; left empty, the next free one is given. */
export function addStaff(staff, { name, role, pin, code }, now) {
  const team = withStaffIds(staff);
  const member = {
    id: newId("stf", now, team),
    code: code === undefined || code === "" ? nextStaffId(team) : checkStaffId(team, code),
    name: cleanName(name),
    role: checkRole(role),
    pinHash: checkPin(pin),
    isActive: true,
    createdAt: now,
  };
  return [...team, member];
}

/** Rename, change role or Staff ID, or (with `pin`) give a new PIN. */
export function updateStaff(staff, id, { name, role, pin, code } = {}) {
  const team = withStaffIds(staff);
  if (!team.some((s) => s.id === id)) throw new Error("That staff member no longer exists.");
  return team.map((s) => {
    if (s.id !== id) return s;
    return {
      ...s,
      ...(name !== undefined ? { name: cleanName(name) } : {}),
      ...(role !== undefined ? { role: checkRole(role) } : {}),
      ...(code !== undefined && code !== "" ? { code: checkStaffId(team, code, id) } : {}),
      ...(pin !== undefined && pin !== "" ? { pinHash: checkPin(pin) } : {}),
    };
  });
}

/** Removing keeps the person's past shifts for the timesheets. */
export const removeStaff = (staff, id) => staff.map((s) => (s.id === id ? { ...s, isActive: false } : s));

/** The active member with this Staff ID, if the PIN is theirs; otherwise null. */
export function findByIdAndPin(staff, code, pin) {
  if (!isValidStaffId(code) || !isValidPin(pin)) return null;
  const member = withStaffIds(staff).find((s) => s.isActive && s.code === String(code));
  return member && member.pinHash === pinHash(pin) ? member : null;
}

export const openShift = (shifts, staffId) => shifts.find((s) => s.staffId === staffId && s.endAt === null) ?? null;

export function clockIn(shifts, staffId, now) {
  if (openShift(shifts, staffId)) throw new Error("Already clocked in.");
  return [...shifts, { id: newId("sft", now, shifts), staffId, startAt: now, endAt: null, closedBy: null }];
}

/** `closedBy: "manager"` marks a shift the manager closed for someone. */
export function clockOut(shifts, staffId, now, closedBy = null) {
  const open = openShift(shifts, staffId);
  if (!open) throw new Error("Not clocked in.");
  return shifts.map((s) => (s.id === open.id ? { ...s, endAt: Math.max(now, s.startAt), closedBy } : s));
}

const MAX_SHIFT_MS = 24 * 3_600_000;

/**
 * The manager sets a shift's real times, e.g. when someone forgot to clock
 * out. The shift is marked corrected so payroll can see it was changed.
 */
export function correctShift(shifts, shiftId, { startAt, endAt }, now) {
  const shift = shifts.find((s) => s.id === shiftId);
  if (!shift) throw new Error("That shift no longer exists.");
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) throw new Error("Enter a clock-in and a clock-out time.");
  if (endAt <= startAt) throw new Error("Clock-out must be after clock-in.");
  if (endAt > now) throw new Error("Clock-out cannot be in the future.");
  if (endAt - startAt > MAX_SHIFT_MS) throw new Error("A shift cannot be longer than 24 hours.");
  const clash = shifts.some((s) => s.id !== shiftId && s.staffId === shift.staffId && s.startAt < endAt && (s.endAt ?? now) > startAt);
  if (clash) throw new Error("Those times overlap another of their shifts.");
  return shifts.map((s) => (s.id === shiftId ? { ...s, startAt, endAt, closedBy: "manager", isCorrected: true } : s));
}

export const shiftMinutes = (shift, now) => Math.max(0, Math.floor(((shift.endAt ?? now) - shift.startAt) / MINUTE_MS));

export const isLongShift = (shift, now) => shift.endAt === null && now - shift.startAt > LONG_SHIFT_HOURS * 3_600_000;

/** "7h 05m", or "45m" under an hour. */
export function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/** Monday 00:00 (device time) of the week holding `at`. */
export function weekStart(at) {
  const date = new Date(at);
  const daysSinceMonday = (date.getDay() + 6) % 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysSinceMonday);
  return date.getTime();
}

export const weekEnd = (start) => {
  const date = new Date(start);
  date.setDate(date.getDate() + 7);
  return date.getTime();
};

/**
 * One row per person who worked in [from, to) or is still active, with their
 * shifts (by start time) and total minutes. Open shifts count up to `now`.
 */
export function timesheet(staff, shifts, from, to, now) {
  return staff
    .map((member) => {
      const own = shifts
        .filter((s) => s.staffId === member.id && s.startAt >= from && s.startAt < to)
        .sort((a, b) => a.startAt - b.startAt);
      return {
        staffId: member.id,
        code: member.code ?? "",
        name: member.name,
        role: member.role,
        isActive: member.isActive,
        shifts: own,
        minutes: own.reduce((sum, s) => sum + shiftMinutes(s, now), 0),
      };
    })
    .filter((row) => row.isActive || row.shifts.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

const csvCell = (value) => {
  const text = String(value);
  // Quote anything with a delimiter, and defuse spreadsheet formulas.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

const isoMinute = (at) => {
  const d = new Date(at);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** A spreadsheet of every shift in the rows, for payroll. */
export function timesheetCsv(rows, now) {
  const lines = [["Staff ID", "Name", "Role", "Clock in", "Clock out", "Hours", "Note"]];
  for (const row of rows) {
    for (const shift of row.shifts) {
      lines.push([
        row.code,
        row.name,
        STAFF_ROLES[row.role] ?? row.role,
        isoMinute(shift.startAt),
        shift.endAt === null ? "still clocked in" : isoMinute(shift.endAt),
        (shiftMinutes(shift, now) / 60).toFixed(2),
        shift.isCorrected ? "times corrected by manager" : shift.closedBy === "manager" ? "clocked out by manager" : "",
      ]);
    }
  }
  return lines.map((line) => line.map(csvCell).join(",")).join("\n");
}
