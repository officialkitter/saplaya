import assert from 'node:assert/strict';
import { test } from 'node:test';
import { duplicateFarmGroups, mergeSourceIdsForTarget, visibleFarms } from '../src/lib/farm-duplicates';
import type { Supplier } from '../src/lib/types';

function farm(id: string, patch: Partial<Supplier> = {}): Supplier {
  return {
    id, name: 'Green Farm', region: 'Arusha', contactName: '', contactEmail: '',
    contactPhone: '', status: 'active', latitude: null, longitude: null,
    commissionPct: 0, joinedAt: 0, emoji: '', ...patch,
  };
}

test('all merged sources disappear from the list and duplicate warnings', () => {
  const farms = [
    farm('kept'),
    farm('one', { mergedIntoSupplierId: 'kept' }),
    farm('two', { mergedIntoSupplierId: 'kept' }),
    farm('other', { region: 'Dodoma' }),
  ];
  assert.deepEqual(visibleFarms(farms).map((item) => item.id), ['kept', 'other']);
  assert.deepEqual(duplicateFarmGroups(farms), []);
});

test('unmerged duplicates remain available for review, including paused farms', () => {
  const farms = [
    farm('first'),
    farm('second', { name: ' green farm ', region: 'ARUSHA', status: 'suspended' }),
    farm('third'),
    farm('merged', { mergedIntoSupplierId: 'first' }),
  ];
  assert.deepEqual(duplicateFarmGroups(farms).map((group) => group.map((item) => item.id)),
    [['first', 'second', 'third']]);
});

test('changing the farm to keep still merges every other selected duplicate', () => {
  const candidates = [farm('first'), farm('second'), farm('third')];
  const sources = mergeSourceIdsForTarget(candidates, ['second', 'third'], 'first', 'second');
  assert.deepEqual(sources, ['first', 'third']);
  const merged = candidates.map((item) => sources.includes(item.id)
    ? { ...item, mergedIntoSupplierId: 'second' }
    : item);
  assert.deepEqual(visibleFarms(merged).map((item) => item.id), ['second']);
  assert.deepEqual(duplicateFarmGroups(merged), []);
});

test('changing the target respects unchecked sources and single-farm merges', () => {
  assert.deepEqual(
    mergeSourceIdsForTarget([farm('first'), farm('second'), farm('unchecked')], ['second'], 'first', 'second'),
    ['first'],
  );
  assert.deepEqual(mergeSourceIdsForTarget([farm('source')], ['source'], 'old-target', 'new-target'), ['source']);
});
