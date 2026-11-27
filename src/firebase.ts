import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, Firestore, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

let app: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;
let providerInstance: GoogleAuthProvider | null = null;
let isFirebaseReady = false;

try {
  const hasConfig =
    typeof window !== 'undefined' &&
    Boolean(firebaseConfig?.apiKey) &&
    Boolean(firebaseConfig?.projectId);

  if (hasConfig) {
    app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
    dbInstance = firebaseConfig.firestoreDatabaseId
      ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
      : getFirestore(app);
    authInstance = getAuth(app);
    providerInstance = new GoogleAuthProvider();
    isFirebaseReady = true;
  }
} catch {
  app = null;
  dbInstance = null;
  authInstance = null;
  providerInstance = null;
  isFirebaseReady = false;
}

export const db = dbInstance;
export const auth = authInstance;
export const googleProvider = providerInstance;
export const firebaseAvailable = isFirebaseReady;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const currentUser = authInstance?.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      tenantId: currentUser?.tenantId,
      providerInfo:
        currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<boolean> {
  if (!dbInstance || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return false;
  }
  try {
    await getDocFromServer(doc(dbInstance, 'test', 'connection'));
    return true;
  } catch {
    return false;
  }
}
