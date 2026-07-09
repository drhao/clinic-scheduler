'use strict';

// Guards the ONE dangerous duplication in this codebase: Apps Script cannot
// import scheduler.js, so google_apps_script.js carries a copy of the
// algorithm between BEGIN/END SHARED SCHEDULER markers. This test fails the
// build if the two copies differ by even one byte, and additionally executes
// the GAS copy to prove it behaves identically to the canonical module.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const Scheduler = require('../scheduler.js');

const BEGIN = '// ===== BEGIN SHARED SCHEDULER (sync-guarded) =====';
const END = '// ===== END SHARED SCHEDULER =====';

function extractBlock(fileName) {
    const text = fs.readFileSync(path.join(__dirname, '..', fileName), 'utf8');
    const start = text.indexOf(BEGIN);
    const stop = text.indexOf(END);
    assert.notStrictEqual(start, -1, `${fileName}: BEGIN marker not found`);
    assert.notStrictEqual(stop, -1, `${fileName}: END marker not found`);
    assert.ok(stop > start, `${fileName}: END marker precedes BEGIN marker`);
    return text.slice(start + BEGIN.length, stop);
}

test('SHARED SCHEDULER block is byte-identical in scheduler.js and google_apps_script.js', () => {
    const canonical = extractBlock('scheduler.js');
    const gasCopy = extractBlock('google_apps_script.js');
    assert.strictEqual(
        gasCopy,
        canonical,
        'The SHARED SCHEDULER blocks have diverged. Edit the block in ' +
        'scheduler.js only, then copy it VERBATIM into google_apps_script.js.'
    );
});

test('the GAS copy of the algorithm produces identical schedules', () => {
    // Execute the extracted GAS block in isolation and compare its output with
    // the canonical module on a scenario that exercises every rule: fairness
    // seed, limits, constraints, holidays, same-day exclusion, round-robin.
    const gasBlock = extractBlock('google_apps_script.js');
    const gas = new Function(
        gasBlock + '\nreturn { generateMonthSchedule, isUnassigned, UNASSIGNED };'
    )();

    const opts = {
        year: 2025,
        month: 0, // January 2025: Wednesdays on the 1st, 8th, 15th, 22nd, 29th
        users: [
            { name: 'A', limit: 2 },
            { name: 'B', limit: 4 },
            { name: 'C', limit: 1 },
        ],
        constraints: [
            { user: 'B', date: '2025-01-08', slot: 'AM' },
            { user: 'A', date: '2025-01-15', slot: 'PM' },
        ],
        holidays: ['2025-01-22'],
        existingSchedule: { '2025-02-05_AM': 'A', '2025-03-05_PM': 'B' },
    };

    const expected = Scheduler.generateMonthSchedule(opts);
    const actual = gas.generateMonthSchedule(opts);
    assert.deepStrictEqual(actual, expected);
    assert.strictEqual(gas.UNASSIGNED, Scheduler.UNASSIGNED);
});
