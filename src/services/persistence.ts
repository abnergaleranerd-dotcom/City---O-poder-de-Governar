import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { signInWithPopup, signOut } from 'firebase/auth';
import {
  auth,
  db,
  firebaseAvailable,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import type { EndGameOutcome } from '../types/game';

const LOCAL_SAVE_KEY = 'city_tycoon_4d_save_v1';

export interface CloudCitySummary {
  id: string;
  cityName: string;
  mayorName: string;
  population: number;
  treasury: number;
  popularity: number;
  day: number;
  month: number;
  year: number;
  developmentLevel: number;
  stateSnapshot: Record<string, unknown>;
}

export interface CloudLegacySummary {
  id: string;
  cityName: string;
  mayorName: string;
  outcome: EndGameOutcome;
  finalPopulation: number;
  finalTreasury: number;
  finalPopularity: number;
  yearsServed: number;
  summary: string;
}

function clampString(value: string, maxLen: number, fallback: string): string {
  const trimmed = (value || fallback).trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLen);
}

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 120);
  return cleaned || `city_${Date.now()}`;
}

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export function saveCityLocal(snapshot: Record<string, unknown>): boolean {
  if (!hasLocalStorage()) return false;
  try {
    localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function loadCityLocalSafe(): {
  status: 'empty' | 'ok' | 'corrupted';
  snapshot: Record<string, unknown> | null;
} {
  if (!hasLocalStorage()) return { status: 'empty', snapshot: null };
  try {
    const raw = localStorage.getItem(LOCAL_SAVE_KEY);
    if (!raw) return { status: 'empty', snapshot: null };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { status: 'corrupted', snapshot: null };
    }
    const obj = parsed as Record<string, unknown>;
    if (!Array.isArray(obj.tiles)) {
      return { status: 'corrupted', snapshot: null };
    }
    return { status: 'ok', snapshot: obj };
  } catch {
    return { status: 'corrupted', snapshot: null };
  }
}

export function loadCityLocal(): Record<string, unknown> | null {
  return loadCityLocalSafe().snapshot;
}

export function clearCityLocal(): void {
  if (!hasLocalStorage()) return;
  try {
    localStorage.removeItem(LOCAL_SAVE_KEY);
  } catch {
    // Ignore storage clear errors
  }
}

export async function signInWithGoogle() {
  if (!firebaseAvailable || !auth || !googleProvider) {
    throw new Error('Sincronização em nuvem indisponível no modo local.');
  }
  const result = await signInWithPopup(auth, googleProvider);
  if (result.user) {
    await ensureUserProfile(result.user.uid, result.user.displayName || 'Prefeito(a)');
  }
  return result.user;
}

export async function signOutGoogle() {
  if (!firebaseAvailable || !auth) return;
  await signOut(auth);
}

export async function ensureUserProfile(uid: string, displayName: string): Promise<void> {
  if (!firebaseAvailable || !db) return;
  const safeUid = sanitizeId(uid);
  const path = `users/${safeUid}`;
  try {
    const ref = doc(db, 'users', safeUid);
    const snap = await getDoc(ref);
    const safeName = clampString(displayName, 100, 'Prefeito(a)');
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: safeUid,
        displayName: safeName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        displayName: safeName,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveCityToCloud(params: {
  slotId: string;
  cityName: string;
  mayorName: string;
  population: number;
  treasury: number;
  popularity: number;
  day: number;
  month: number;
  year: number;
  developmentLevel: number;
  stateSnapshot: Record<string, unknown>;
}): Promise<string> {
  if (!firebaseAvailable || !db || !auth) {
    throw new Error('Firebase indisponível. Utilize o salvamento local do navegador.');
  }
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Faça login com sua conta Google para salvar na nuvem.');
  }

  const safeId = sanitizeId(params.slotId);
  const path = `cities/${safeId}`;
  const docRef = doc(db, 'cities', safeId);

  try {
    const existingSnap = await getDoc(docRef);
    const basePayload = {
      cityName: clampString(params.cityName, 80, 'Nova Cidade'),
      mayorName: clampString(params.mayorName, 80, 'Prefeito(a)'),
      population: Math.max(0, Math.round(params.population)),
      treasury: Math.round(params.treasury),
      popularity: Math.min(100, Math.max(0, Math.round(params.popularity))),
      day: Math.min(31, Math.max(1, Math.round(params.day))),
      month: Math.min(12, Math.max(1, Math.round(params.month))),
      year: Math.min(9999, Math.max(1, Math.round(params.year))),
      developmentLevel: Math.min(6, Math.max(1, Math.round(params.developmentLevel))),
      stateSnapshot: params.stateSnapshot,
      updatedAt: serverTimestamp(),
    };

    if (existingSnap.exists()) {
      await updateDoc(docRef, basePayload);
    } else {
      await setDoc(docRef, {
        ownerId: user.uid,
        ...basePayload,
        createdAt: serverTimestamp(),
      });
    }
    return safeId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function loadCitiesFromCloud(): Promise<CloudCitySummary[]> {
  if (!firebaseAvailable || !db || !auth) return [];
  const user = auth.currentUser;
  if (!user) return [];

  const path = 'cities';
  try {
    const q = query(collection(db, path), where('ownerId', '==', user.uid));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        cityName: String(data.cityName || 'Cidade'),
        mayorName: String(data.mayorName || 'Prefeito'),
        population: Number(data.population || 0),
        treasury: Number(data.treasury || 0),
        popularity: Number(data.popularity || 0),
        day: Number(data.day || 1),
        month: Number(data.month || 1),
        year: Number(data.year || 1),
        developmentLevel: Number(data.developmentLevel || 1),
        stateSnapshot: (data.stateSnapshot as Record<string, unknown>) || {},
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function deleteCityFromCloud(slotId: string): Promise<void> {
  if (!firebaseAvailable || !db || !auth) return;
  const user = auth.currentUser;
  if (!user) return;
  const safeId = sanitizeId(slotId);
  const path = `cities/${safeId}`;
  try {
    await deleteDoc(doc(db, 'cities', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveLegacyToCloud(params: {
  cityName: string;
  mayorName: string;
  outcome: EndGameOutcome;
  finalPopulation: number;
  finalTreasury: number;
  finalPopularity: number;
  yearsServed: number;
  summary: string;
}): Promise<void> {
  if (!firebaseAvailable || !db || !auth) return;
  const user = auth.currentUser;
  if (!user) return;
  const legacyId = sanitizeId(`legacy_${user.uid}_${Date.now()}`);
  const path = `legacies/${legacyId}`;
  try {
    await setDoc(doc(db, 'legacies', legacyId), {
      ownerId: user.uid,
      cityName: clampString(params.cityName, 80, 'Cidade'),
      mayorName: clampString(params.mayorName, 80, 'Prefeito'),
      outcome: params.outcome,
      finalPopulation: Math.max(0, Math.round(params.finalPopulation)),
      finalTreasury: Math.round(params.finalTreasury),
      finalPopularity: Math.min(100, Math.max(0, Math.round(params.finalPopularity))),
      yearsServed: Math.max(0, Math.round(params.yearsServed)),
      summary: clampString(params.summary, 500, 'Mandato encerrado.'),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function loadLegaciesFromCloud(): Promise<CloudLegacySummary[]> {
  if (!firebaseAvailable || !db || !auth) return [];
  const user = auth.currentUser;
  if (!user) return [];
  const path = 'legacies';
  try {
    const q = query(collection(db, path), where('ownerId', '==', user.uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        cityName: String(data.cityName || 'Cidade'),
        mayorName: String(data.mayorName || 'Prefeito'),
        outcome: (data.outcome as EndGameOutcome) || 'resigned',
        finalPopulation: Number(data.finalPopulation || 0),
        finalTreasury: Number(data.finalTreasury || 0),
        finalPopularity: Number(data.finalPopularity || 0),
        yearsServed: Number(data.yearsServed || 0),
        summary: String(data.summary || ''),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}
