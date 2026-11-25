import test from 'node:test';
import assert from 'node:assert/strict';
import { gregorian, jalaliInput, atTehran, dayInTehran } from '../lib/date';
import { calendarWindow } from '../lib/calendar';
import { definitionSchema, grade, validAnswer, validDefinition } from '../lib/scoring';
import { hashPassword, verifyPassword } from '../lib/password';
import { parseCsv } from '../lib/csv';
const d = (data: Record<string, unknown>) => definitionSchema.parse({ points: 3, penalty: 1, ...data });

test('Jalali Nowruz, leap day, Persian and Arabic numerals', () => {
  assert.equal(gregorian('۱۴۰۳/۰۱/۰۱'), '2024-03-20');
  assert.equal(gregorian('١٤٠٣/١٢/٣٠'), '2025-03-20');
  assert.equal(jalaliInput('2025-03-20'), '1403/12/30');
  assert.throws(() => gregorian('1402/12/30'));
  assert.throws(() => gregorian('1405/02/32'));
  assert.throws(() => gregorian('1405/13/01'));
});
test('Tehran local midnight and Jalali month/week boundaries', () => {
  assert.equal(atTehran('۱۴۰۵/۰۱/۰۱', '۰۰:۰۰').toISOString(), '2026-03-20T20:30:00.000Z');
  assert.equal(dayInTehran(new Date('2026-03-20T21:00:00Z')), '2026-03-21');
  assert.equal(calendarWindow('2025-03-19', 'month').days.length, 30);
  assert.equal(new Date(calendarWindow('2026-03-25', 'week').start + 'T12:00:00Z').getUTCDay(), 6);
});
test('objective question scoring, penalties and skipped answers', () => {
  const single = d({ options: ['الف', 'ب'], key: [1] });
  assert.ok(validDefinition('single', single));
  assert.equal(grade('single', single, 1, true), 3);
  assert.equal(grade('single', single, 0, true), -1);
  assert.equal(grade('single', single, 0, false), 0);
  assert.equal(grade('single', single, null, true), 0);
  assert.equal(grade('bool', d({ key: [0] }), 0, false), 3);
  assert.equal(grade('short', d({ key: ['کیف  ۱۲'] }), 'كيف 12', false), 3);
  assert.equal(grade('blank', d({ key: ['آب'] }), ' آب ', false), 3);
  assert.equal(grade('number', d({ key: [1.5], tolerance: 0.1 }), '۱٫۵۵', false), 3);
});
test('partial scoring, manual scoring, and invalid answer shapes', () => {
  assert.equal(
    grade('multi', d({ key: [0, 1], options: ['الف', 'ب', 'ج'], partial: true }), [0], false),
    1.5
  );
  assert.equal(
    grade(
      'match',
      d({ key: [1, 0], options: ['الف', 'ب'], right: ['یک', 'دو'], partial: true }),
      [1, null],
      false
    ),
    1.5
  );
  assert.equal(grade('order', d({ key: [1, 0], options: ['الف', 'ب'], partial: true }), [1, 0], false), 3);
  assert.equal(grade('long', d({}), 'شرح', false), null);
  assert.equal(grade('file', d({}), 'file', false), null);
  assert.equal(grade('image', d({}), 'شرح', false), null);
  assert.ok(!validAnswer('multi', d({ options: ['الف', 'ب'] }), [0, 0]));
  assert.ok(!validAnswer('number', d({}), {}));
  assert.ok(!validDefinition('image', d({})));
});
test('CSV escaping and multiline cells', () => {
  assert.deepEqual(parseCsv('\ufeffcode,notes\r\n1,"الف, ""ب""\nج"'), [
    ['code', 'notes'],
    ['1', 'الف, "ب"\nج'],
  ]);
  assert.throws(() => parseCsv('"ناقص'));
});
test('password salts, success and invalid credentials', async () => {
  const input = 'a-long-local-credential';
  const hash = await hashPassword(input);
  assert.notEqual(hash, await hashPassword(input));
  assert.ok(await verifyPassword(input, hash));
  assert.ok(!(await verifyPassword('incorrect', hash)));
  assert.ok(!(await verifyPassword(input, undefined)));
});
