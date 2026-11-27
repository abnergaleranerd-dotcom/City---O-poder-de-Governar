/**
 * Phase 0 Payload-First Security Test Specification for City Tycoon 4D.
 * Verifies that all Dirty Dozen attack payloads are denied by firestore.rules.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  operation: 'create' | 'update' | 'get' | 'list' | 'delete';
  path: string;
  expected: 'PERMISSION_DENIED';
  payload?: Record<string, unknown>;
}

export const DIRTY_DOZEN_CASES: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Shadow Field Injection on CitySave Create',
    operation: 'create',
    path: '/cities/city_1',
    expected: 'PERMISSION_DENIED',
    payload: { ownerId: 'user_a', cityName: 'Nova Esperança', isAdmin: true },
  },
  {
    id: 2,
    name: 'Identity Spoofing on CitySave Create',
    operation: 'create',
    path: '/cities/city_2',
    expected: 'PERMISSION_DENIED',
    payload: { ownerId: 'victim_uid', cityName: 'Cidade Falsa' },
  },
  {
    id: 3,
    name: 'Client Timestamp Forgery on CitySave Create',
    operation: 'create',
    path: '/cities/city_3',
    expected: 'PERMISSION_DENIED',
    payload: { ownerId: 'user_a', createdAt: '2020-01-01T00:00:00Z' },
  },
  {
    id: 4,
    name: 'Unverified Email Bypass',
    operation: 'create',
    path: '/users/user_unverified',
    expected: 'PERMISSION_DENIED',
    payload: { uid: 'user_unverified', displayName: 'Fake' },
  },
  {
    id: 5,
    name: 'Oversized String Resource Poisoning',
    operation: 'create',
    path: '/cities/city_5',
    expected: 'PERMISSION_DENIED',
    payload: { ownerId: 'user_a', cityName: 'X'.repeat(500) },
  },
  {
    id: 6,
    name: 'Document ID Poisoning',
    operation: 'create',
    path: '/cities/invalid$id!chars',
    expected: 'PERMISSION_DENIED',
    payload: { ownerId: 'user_a', cityName: 'Test' },
  },
  {
    id: 7,
    name: 'Immutable Owner Reassignment on Update',
    operation: 'update',
    path: '/cities/city_1',
    expected: 'PERMISSION_DENIED',
    payload: { ownerId: 'other_user' },
  },
  {
    id: 8,
    name: 'Shadow Key Update on CitySave',
    operation: 'update',
    path: '/cities/city_1',
    expected: 'PERMISSION_DENIED',
    payload: { hackedFlag: true },
  },
  {
    id: 9,
    name: 'Blanket List Scraping on /cities',
    operation: 'list',
    path: '/cities',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Cross-User Private Profile Read',
    operation: 'get',
    path: '/users/victim_uid',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Invalid Outcome Enum on CityLegacy',
    operation: 'create',
    path: '/legacies/leg_1',
    expected: 'PERMISSION_DENIED',
    payload: { ownerId: 'user_a', outcome: 'god_mode' },
  },
  {
    id: 12,
    name: 'Terminal Record Mutation on CityLegacy',
    operation: 'update',
    path: '/legacies/leg_1',
    expected: 'PERMISSION_DENIED',
    payload: { finalPopularity: 100 },
  },
];
