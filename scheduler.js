/**
 * Canonical monthly scheduling algorithm, shared by the browser UI and unit
 * tests. Loads as a global `Scheduler` via <script>, or via require() in Node.
 *
 * SYNC RULE: everything between the BEGIN/END SHARED SCHEDULER markers below
 * must be byte-identical to the same block in google_apps_script.js, because
 * Apps Script cannot import local files. tests/parity.test.js enforces this —
 * edit the block HERE, run `npm test`, then paste it verbatim into
 * google_apps_script.js.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.Scheduler = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

// The block below is intentionally NOT indented: it must stay byte-identical
// with its copy in google_apps_script.js (tests/parity.test.js checks this).

// ===== BEGIN SHARED SCHEDULER (sync-guarded) =====
// This block MUST be byte-identical in scheduler.js and google_apps_script.js
// (tests/parity.test.js enforces it). Edit the copy in scheduler.js, run
// `npm test`, then paste the whole block verbatim into google_apps_script.js.
// Keep it dependency-free: no DOM, no SpreadsheetApp, no outer-scope references.

// Sentinel written when no eligible doctor can be found for a slot.
// "Unassigned" is the legacy English value; accept both when reading.
var UNASSIGNED = "未安排";

function isUnassigned(name) {
    return name === UNASSIGNED || name === "Unassigned";
}

// Accepts a Date (normal case) or an already-formatted string (Sheets cells
// may hold either); anything else falls back to String().
function formatDate(date) {
    if (!date) return "";
    if (typeof date === 'string') return date;
    try {
        var y = date.getFullYear();
        var m = String(date.getMonth() + 1).padStart(2, '0');
        var d = String(date.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + d;
    } catch (e) {
        return String(date);
    }
}

// Upper bound on search steps when the plain greedy pass leaves empty slots.
// A month has at most 10 slots, so this is generous; it only caps
// pathological inputs and keeps the result deterministic.
var MAX_SEARCH_STEPS = 50000;

/**
 * Builds the schedule for one month's Wednesdays (AM + PM). Returns a NEW
 * schedule map; opts.existingSchedule is never mutated. Entries for other
 * months/days are carried over untouched (so the yearly stats survive).
 *
 * Rules, applied per slot in queue order:
 *   1. fairness: queue seeded by this-year duty count asc (excluding the
 *      target month), then name asc;
 *   2. skip anyone at/over their monthly `limit`;
 *   3. skip anyone with a matching constraint (畫休);
 *   4. skip anyone already assigned the other slot the same day;
 *   5. round-robin: an assigned doctor moves to the back of the queue.
 * Holidays clear that Wednesday's slots and assign no one. A slot with no
 * eligible doctor is set to UNASSIGNED.
 *
 * Look-ahead: picking the first eligible doctor can use someone up who is
 * the only option for a later slot. The slots are therefore searched
 * depth-first, trying candidates in queue order and "leave empty" last. The
 * first complete path is exactly the greedy result above; the search only
 * continues while slots are still empty, revising the latest picks first,
 * and keeps the schedule with the fewest UNASSIGNED slots.
 *
 * @param {{year:number, month:number, users:Array, constraints:Array,
 *          holidays:Array, existingSchedule:Object}} opts  month is 0-indexed
 * @return {Object} new schedule map "YYYY-MM-DD_AM|PM" -> name
 */
function generateMonthSchedule(opts) {
    var year = opts.year;
    var month = opts.month; // 0 = January
    var users = opts.users || [];
    var constraints = opts.constraints || [];
    var holidays = opts.holidays || [];
    var schedule = Object.assign({}, opts.existingSchedule || {});

    // 1. Fairness seed: this-year counts, excluding the target month.
    var yearlyCounts = {};
    users.forEach(function (u) { yearlyCounts[u.name] = 0; });
    Object.keys(schedule).forEach(function (key) {
        var dateStr = key.split('_')[0];
        var parts = dateStr.split('-').map(Number);
        if (parts[0] === year && (parts[1] - 1) !== month) {
            var who = schedule[key];
            if (who && !isUnassigned(who) && yearlyCounts.hasOwnProperty(who)) {
                yearlyCounts[who]++;
            }
        }
    });

    var queue = users.slice().sort(function (a, b) {
        var ca = yearlyCounts[a.name] || 0;
        var cb = yearlyCounts[b.name] || 0;
        if (ca !== cb) return ca - cb;
        return a.name.localeCompare(b.name);
    });

    var blocked = {};
    constraints.forEach(function (c) {
        blocked[c.user + '|' + c.date + '|' + c.slot] = true;
    });

    // The month's slots in order: each Wednesday's AM, then its PM.
    var slots = [];
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    for (var d = 1; d <= daysInMonth; d++) {
        var dateObj = new Date(year, month, d);
        if (dateObj.getDay() !== 3) continue; // Wednesday only
        var dateStr = formatDate(dateObj);

        // Clear this day first so stale entries never survive a re-run.
        delete schedule[dateStr + '_AM'];
        delete schedule[dateStr + '_PM'];

        if (holidays.indexOf(dateStr) !== -1) continue;

        slots.push({ date: dateStr, slot: 'AM' });
        slots.push({ date: dateStr, slot: 'PM' });
    }

    var monthlyCounts = {};
    var capacityLeft = 0;
    users.forEach(function (u) {
        monthlyCounts[u.name] = 0;
        capacityLeft += Math.max(0, u.limit);
    });

    // hopelessFrom[i]: slots from i on that every doctor has 畫休 for.
    var hopelessFrom = [];
    hopelessFrom[slots.length] = 0;
    for (var h = slots.length - 1; h >= 0; h--) {
        var open = users.some(function (u) {
            return !blocked[u.name + '|' + slots[h].date + '|' + slots[h].slot];
        });
        hopelessFrom[h] = hopelessFrom[h + 1] + (open ? 0 : 1);
    }

    var picks = [];
    var best = null;
    var bestEmpty = Infinity;
    var steps = 0;

    function search(i, order, empty) {
        // Slots that must stay empty: not enough limit left, or nobody free.
        var unfillable = Math.max(0, (slots.length - i) - capacityLeft, hopelessFrom[i]);
        if (empty + unfillable >= bestEmpty) return;
        if (i === slots.length) {
            best = picks.slice();
            bestEmpty = empty;
            return;
        }
        if (steps >= MAX_SEARCH_STEPS) return;
        steps++;

        var s = slots[i];
        for (var q = 0; q < order.length; q++) {
            var user = order[q];
            if (monthlyCounts[user.name] >= user.limit) continue;
            if (blocked[user.name + '|' + s.date + '|' + s.slot]) continue;
            if (s.slot === 'PM' && picks[i - 1] === user.name) continue; // same-day

            picks[i] = user.name;
            monthlyCounts[user.name]++;
            capacityLeft--;
            // round-robin: the picked doctor moves to the back of the queue
            search(i + 1, order.slice(0, q).concat(order.slice(q + 1), [user]), empty);
            monthlyCounts[user.name]--;
            capacityLeft++;
            if (bestEmpty === 0) return;
        }
        picks[i] = UNASSIGNED;
        search(i + 1, order, empty + 1);
    }

    search(0, queue, 0);

    slots.forEach(function (s, i) {
        schedule[s.date + '_' + s.slot] = best[i];
    });

    return schedule;
}
// ===== END SHARED SCHEDULER =====

    return {
        UNASSIGNED: UNASSIGNED,
        isUnassigned: isUnassigned,
        formatDate: formatDate,
        generateMonthSchedule: generateMonthSchedule
    };
}));
