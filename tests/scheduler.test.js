'use strict';

// Run with: node --test
const { test } = require('node:test');
const assert = require('node:assert');
const { generateMonthSchedule, UNASSIGNED } = require('../scheduler.js');

// January 2025 is convenient: Jan 1 2025 is a Wednesday, so the Wednesdays are
// the 1st, 8th, 15th, 22nd and 29th (5 Wednesdays => 10 slots).
const YEAR = 2025;
const MONTH = 0; // January
const WEDNESDAYS = ['2025-01-01', '2025-01-08', '2025-01-15', '2025-01-22', '2025-01-29'];

function users(spec) {
    // spec: { name: limit, ... }
    return Object.keys(spec).map((name) => ({ name, limit: spec[name] }));
}

function run(overrides) {
    return generateMonthSchedule(Object.assign({
        year: YEAR,
        month: MONTH,
        users: users({ A: 4, B: 4, C: 4, D: 4 }),
        constraints: [],
        holidays: [],
        existingSchedule: {},
    }, overrides));
}

test('fills every Wednesday AM and PM when staff are plentiful', () => {
    const s = run();
    WEDNESDAYS.forEach((date) => {
        assert.ok(s[`${date}_AM`] && s[`${date}_AM`] !== UNASSIGNED, `${date} AM filled`);
        assert.ok(s[`${date}_PM`] && s[`${date}_PM`] !== UNASSIGNED, `${date} PM filled`);
    });
});

test('never books the same person for both AM and PM on one day', () => {
    const s = run();
    WEDNESDAYS.forEach((date) => {
        assert.notStrictEqual(s[`${date}_AM`], s[`${date}_PM`], `${date} AM != PM`);
    });
});

test('a single doctor cannot cover both slots, so PM is left unassigned', () => {
    const s = run({ users: users({ Solo: 99 }) });
    WEDNESDAYS.forEach((date) => {
        assert.strictEqual(s[`${date}_AM`], 'Solo');
        assert.strictEqual(s[`${date}_PM`], UNASSIGNED);
    });
});

test('respects the monthly limit as a hard cap', () => {
    const s = run({ users: users({ A: 1, B: 1 }) });
    const counts = {};
    Object.keys(s).forEach((k) => {
        const who = s[k];
        if (who !== UNASSIGNED) counts[who] = (counts[who] || 0) + 1;
    });
    assert.strictEqual(counts.A, 1);
    assert.strictEqual(counts.B, 1);
    // 10 slots, only 2 can be filled -> 8 unassigned.
    const unassigned = Object.keys(s).filter((k) => s[k] === UNASSIGNED).length;
    assert.strictEqual(unassigned, 8);
});

test('honours a constraint (画休) for a specific date and slot', () => {
    const s = run({
        users: users({ A: 99 }), // only A, so A would otherwise take every AM
        constraints: [{ user: 'A', date: '2025-01-15', slot: 'AM' }],
    });
    assert.strictEqual(s['2025-01-15_AM'], UNASSIGNED);
    assert.strictEqual(s['2025-01-01_AM'], 'A'); // unaffected dates still assigned
});

test('a holiday clears that Wednesday and assigns no one', () => {
    const s = run({ holidays: ['2025-01-08'] });
    assert.ok(!('2025-01-08_AM' in s));
    assert.ok(!('2025-01-08_PM' in s));
    // Other Wednesdays unaffected.
    assert.ok(s['2025-01-01_AM'] && s['2025-01-01_AM'] !== UNASSIGNED);
});

test('fairness seed: the doctor with fewer prior duties this year goes first', () => {
    const s = run({
        users: users({ A: 4, B: 4 }),
        // A already has 2 duties earlier this year (a different month) -> B leads.
        existingSchedule: { '2025-02-05_AM': 'A', '2025-02-12_AM': 'A' },
    });
    assert.strictEqual(s['2025-01-01_AM'], 'B');
});

test('does not mutate the existing schedule passed in', () => {
    const existing = { '2025-02-05_AM': 'A' };
    const snapshot = JSON.stringify(existing);
    run({ users: users({ A: 4, B: 4 }), existingSchedule: existing });
    assert.strictEqual(JSON.stringify(existing), snapshot);
});

test('re-running overwrites a stale assignment for the target month', () => {
    // A stale entry for a target-month Wednesday should be recomputed, not kept.
    const s = run({
        users: users({ A: 4, B: 4 }),
        existingSchedule: { '2025-01-01_AM': 'GHOST' },
    });
    assert.notStrictEqual(s['2025-01-01_AM'], 'GHOST');
});

test('leaves every slot unassigned when everyone is constrained', () => {
    const date = '2025-01-01';
    const s = run({
        users: users({ A: 4 }),
        constraints: [
            { user: 'A', date, slot: 'AM' },
            { user: 'A', date, slot: 'PM' },
        ],
    });
    assert.strictEqual(s[`${date}_AM`], UNASSIGNED);
    assert.strictEqual(s[`${date}_PM`], UNASSIGNED);
});

// Look-ahead: the greedy pick can use up the only doctor a later slot needs.
// Only 2025-01-01 and 2025-01-08 remain; the other Wednesdays are holidays.
const TWO_WEEKS_OFF = ['2025-01-15', '2025-01-22', '2025-01-29'];

test('look-ahead: gives AM to the second doctor when only the first can do PM', () => {
    const s = run({
        users: users({ A: 4, B: 4 }),
        constraints: [{ user: 'B', date: '2025-01-01', slot: 'PM' }],
        holidays: ['2025-01-08'].concat(TWO_WEEKS_OFF),
    });
    // Greedy alone would give AM to A (first in queue) and leave PM empty.
    assert.strictEqual(s['2025-01-01_AM'], 'B');
    assert.strictEqual(s['2025-01-01_PM'], 'A');
});

test('look-ahead: does not spend a limited doctor on a slot someone else could take', () => {
    // Availability: 01 AM {A,B} · 01 PM {C} · 08 AM {C} · 08 PM {A}; A limit 1.
    const s = run({
        users: users({ A: 1, B: 1, C: 2 }),
        constraints: [
            { user: 'A', date: '2025-01-01', slot: 'PM' },
            { user: 'B', date: '2025-01-01', slot: 'PM' },
            { user: 'A', date: '2025-01-08', slot: 'AM' },
            { user: 'B', date: '2025-01-08', slot: 'AM' },
            { user: 'B', date: '2025-01-08', slot: 'PM' },
            { user: 'C', date: '2025-01-08', slot: 'PM' },
        ],
        holidays: TWO_WEEKS_OFF,
    });
    // Greedy alone: 01 AM A, 01 PM C, 08 AM C, 08 PM empty (A at limit).
    assert.deepStrictEqual(
        [s['2025-01-01_AM'], s['2025-01-01_PM'], s['2025-01-08_AM'], s['2025-01-08_PM']],
        ['B', 'C', 'C', 'A']
    );
});

test('look-ahead keeps the plain queue-order result when it already fills every slot', () => {
    // A leads the queue (fewest prior duties), so A takes the first AM.
    const s = run({ users: users({ A: 4, B: 4, C: 4 }) });
    assert.deepStrictEqual(
        WEDNESDAYS.map((date) => [s[`${date}_AM`], s[`${date}_PM`]]),
        [['A', 'B'], ['C', 'A'], ['B', 'C'], ['A', 'B'], ['C', 'A']]
    );
});

test('look-ahead still leaves a slot empty when no complete schedule exists', () => {
    // Only A can work 01-01 and A cannot do both slots.
    const s = run({
        users: users({ A: 4, B: 4 }),
        constraints: [
            { user: 'B', date: '2025-01-01', slot: 'AM' },
            { user: 'B', date: '2025-01-01', slot: 'PM' },
        ],
        holidays: ['2025-01-08'].concat(TWO_WEEKS_OFF),
    });
    const empties = ['2025-01-01_AM', '2025-01-01_PM'].filter((k) => s[k] === UNASSIGNED);
    assert.strictEqual(empties.length, 1);
    assert.strictEqual(s['2025-01-01_AM'], 'A'); // greedy order is kept
});
