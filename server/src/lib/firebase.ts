import fs from 'node:fs';
import path from 'node:path';
import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { config, repoRoot } from '../config.js';

let app: App | null = null;
let db: Firestore | null = null;

/**
 * Hosting UIs and shells mangle PEMs: wrapping quotes, literal `\n`, or
 * doubled escapes. Normalize before handing the key to firebase-admin.
 */
function normalizePrivateKey(key: string): string {
  let k = key.trim();
  if (
    (k.startsWith('"') && k.endsWith('"')) ||
    (k.startsWith("'") && k.endsWith("'"))
  ) {
    k = k.slice(1, -1).trim();
  }
  // `\\\\n` (double-escaped) → `\\n` → real newline.
  k = k.replace(/\\\\n/g, '\n').replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
  return k;
}

function loadFromServiceAccountFile():
  | { projectId: string; clientEmail: string; privateKey: string }
  | null {
  const relative = config.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!relative) return null;
  const filePath = path.isAbsolute(relative) ? relative : path.resolve(repoRoot, relative);
  if (!fs.existsSync(filePath)) {
    throw new Error(`FIREBASE_SERVICE_ACCOUNT_PATH not found: ${filePath}`);
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
    project_id?: string;
    client_email?: string;
    private_key?: string;
  };
  if (!raw.project_id || !raw.client_email || !raw.private_key) {
    throw new Error('Service account JSON is missing project_id / client_email / private_key.');
  }
  return {
    projectId: raw.project_id,
    clientEmail: raw.client_email,
    privateKey: normalizePrivateKey(raw.private_key),
  };
}

function loadServiceAccount():
  | { projectId: string; clientEmail: string; privateKey: string }
  | null {
  // Prefer the JSON file when present — PEM-in-env is fragile across
  // dotenv / Vercel / Netlify. Discrete vars are for serverless only.
  const fromFile = loadFromServiceAccountFile();
  if (fromFile) return fromFile;

  if (config.FIREBASE_PROJECT_ID && config.FIREBASE_CLIENT_EMAIL && config.FIREBASE_PRIVATE_KEY) {
    return {
      projectId: config.FIREBASE_PROJECT_ID,
      clientEmail: config.FIREBASE_CLIENT_EMAIL,
      privateKey: normalizePrivateKey(config.FIREBASE_PRIVATE_KEY),
    };
  }

  return null;
}

/** True when Firebase env is present (Firestore becomes the durable store). */
export function firebaseConfigured(): boolean {
  return Boolean(
    (config.FIREBASE_PROJECT_ID &&
      config.FIREBASE_CLIENT_EMAIL &&
      config.FIREBASE_PRIVATE_KEY) ||
      config.FIREBASE_SERVICE_ACCOUNT_PATH,
  );
}

export function getFirebaseApp(): App {
  if (app) return app;
  if (getApps().length > 0) {
    app = getApps()[0]!;
    return app;
  }

  const sa = loadServiceAccount();
  if (sa) {
    app = initializeApp({
      credential: cert({
        projectId: sa.projectId,
        clientEmail: sa.clientEmail,
        privateKey: sa.privateKey,
      }),
      projectId: sa.projectId,
    });
  } else {
    // ADC fallback for Cloud Run / etc. Local + Vercel should set explicit creds.
    app = initializeApp({ credential: applicationDefault() });
  }
  return app;
}

export function getDb(): Firestore {
  if (db) return db;
  db = getFirestore(getFirebaseApp());
  return db;
}
