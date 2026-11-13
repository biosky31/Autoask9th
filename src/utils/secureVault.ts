import type {
  CalibrationSettings,
  ExamModel,
  ScannedResult,
  StudentAssignment,
} from "../types/omr";
import { PRESET_EXAMS } from "../data/presetExams";

export const MIN_PASSPHRASE_LENGTH = 16;

const VAULT_STORAGE_KEY = "ishraq_omr_vault_v1";
const LEGACY_KEYS = {
  exams: "ishraq_omr_exams_v1",
  results: "ishraq_omr_results_v1",
  calibration: "ishraq_omr_calibration_v1",
  committees: "ishraq_omr_committees_v1",
  roster: "ishraq_omr_roster_v1",
};
const LEGACY_SEED_IDS = new Set([
  "stu_seed_1",
  "stu_seed_2",
  "stu_seed_3",
  "stu_seed_4",
]);

export interface VaultPayload {
  exams: ExamModel[];
  committees: string[];
  roster: StudentAssignment[];
  results: ScannedResult[];
  calibration: CalibrationSettings;
}

export interface StoredVaultEnvelope {
  v: 1;
  salt: string;
  iv: string;
  verifier: string;
  ciphertext: string;
}

export interface ActiveVaultSession {
  salt: string;
  verifier: string;
  aesKey: CryptoKey;
}

export const DEFAULT_CALIBRATION: CalibrationSettings = {
  fillThreshold: 0.24,
  multiMarkMargin: 0.1,
  contrastBoost: 1.15,
};

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function generateStrongPassphrase(length = 28): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*_-+=";
  const all = upper + lower + digits + symbols;

  const chars: string[] = [];
  const randomBytes = new Uint32Array(length);
  crypto.getRandomValues(randomBytes);

  // Guarantee character diversity in first 4 slots, then shuffle
  const requiredSets = [upper, lower, digits, symbols];
  for (let i = 0; i < requiredSets.length && i < length; i++) {
    const set = requiredSets[i];
    chars.push(set[randomBytes[i] % set.length]);
  }
  for (let i = chars.length; i < length; i++) {
    chars.push(all[randomBytes[i] % all.length]);
  }

  // Fisher-Yates shuffle with fresh random values
  const shuffleBytes = new Uint32Array(chars.length);
  crypto.getRandomValues(shuffleBytes);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = shuffleBytes[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  // Group into readable 7-char segments separated by "-" (28 chars -> 31 with dashes)
  const joined = chars.join("");
  const chunks: string[] = [];
  for (let i = 0; i < joined.length; i += 7) {
    chunks.push(joined.slice(i, i + 7));
  }
  return chunks.join("-");
}

export function evaluatePassphraseStrength(passphrase: string) {
  const len = passphrase.length;
  const hasUpper = /[A-Z]/.test(passphrase);
  const hasLower = /[a-z]/.test(passphrase);
  const hasDigit = /[0-9]/.test(passphrase);
  const hasSymbol = /[^A-Za-z0-9\s]/.test(passphrase);
  const varietyCount = [hasUpper, hasLower, hasDigit, hasSymbol].filter(Boolean).length;

  const isLongEnough = len >= MIN_PASSPHRASE_LENGTH;
  let score = 0;
  if (len >= 16) score += 2;
  if (len >= 24) score += 1;
  if (varietyCount >= 3) score += 1;
  if (varietyCount === 4) score += 1;

  let label = "ضعيف جداً";
  if (!isLongEnough) {
    label = `قصير (الحد الأدنى ${MIN_PASSPHRASE_LENGTH} حرفاً)`;
  } else if (score >= 5) {
    label = "قوي جداً (آمن للغاية)";
  } else if (score >= 3) {
    label = "قوي وآمن";
  } else {
    label = "مقبول (يفضل تنويع الرموز والأرقام)";
  }

  return {
    length: len,
    isLongEnough,
    hasUpper,
    hasLower,
    hasDigit,
    hasSymbol,
    score,
    label,
  };
}

async function deriveKeys(passphrase: string, saltBytes: Uint8Array) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );

  // Derive 512 bits: 256 bits for verifier + 256 bits for AES-GCM key
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: toArrayBuffer(saltBytes),
      iterations: 210000,
      hash: "SHA-256",
    },
    baseKey,
    512
  );

  const full = new Uint8Array(bits);
  const verifierBytes = full.slice(0, 32);
  const aesRaw = full.slice(32, 64);

  const aesKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(aesRaw),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );

  return {
    verifier: toBase64(verifierBytes),
    aesKey,
  };
}

export function hasLocalVault(): boolean {
  try {
    return Boolean(localStorage.getItem(VAULT_STORAGE_KEY));
  } catch {
    return false;
  }
}

export function loadLegacyOrInitialPayload(): VaultPayload {
  const loadKey = <T>(key: string, fallback: T): T => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  };

  const presetMap = new Map(PRESET_EXAMS.map((p) => [p.id, p]));
  const rawExams = loadKey<ExamModel[]>(LEGACY_KEYS.exams, PRESET_EXAMS);
  const exams = rawExams.map((ex) => ({
    ...ex,
    examGroup:
      ex.examGroup ||
      presetMap.get(ex.id)?.examGroup ||
      ex.title ||
      `اختبار ${ex.subject}`,
  }));

  const committees = loadKey<string[]>(LEGACY_KEYS.committees, []);
  const roster = loadKey<StudentAssignment[]>(LEGACY_KEYS.roster, []).filter(
    (s) => !LEGACY_SEED_IDS.has(s.id)
  );
  const results = loadKey<ScannedResult[]>(LEGACY_KEYS.results, []);
  const calibration = loadKey<CalibrationSettings>(
    LEGACY_KEYS.calibration,
    DEFAULT_CALIBRATION
  );

  return { exams, committees, roster, results, calibration };
}

function clearLegacyPlaintextKeys(): void {
  try {
    for (const k of Object.values(LEGACY_KEYS)) {
      localStorage.removeItem(k);
    }
  } catch {
    // Ignore storage errors
  }
}

export async function saveVaultWithSession(
  session: ActiveVaultSession,
  payload: VaultPayload
): Promise<void> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    session.aesKey,
    toArrayBuffer(encoded)
  );

  const envelope: StoredVaultEnvelope = {
    v: 1,
    salt: session.salt,
    iv: toBase64(iv),
    verifier: session.verifier,
    ciphertext: toBase64(new Uint8Array(cipherBuf)),
  };

  localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(envelope));
  clearLegacyPlaintextKeys();
}

export async function createVault(
  passphrase: string,
  payload: VaultPayload
): Promise<ActiveVaultSession> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const { verifier, aesKey } = await deriveKeys(passphrase, saltBytes);
  const session: ActiveVaultSession = {
    salt: toBase64(saltBytes),
    verifier,
    aesKey,
  };
  await saveVaultWithSession(session, payload);
  return session;
}

export async function unlockVault(
  passphrase: string
): Promise<{ ok: true; session: ActiveVaultSession; payload: VaultPayload } | { ok: false }> {
  try {
    const raw = localStorage.getItem(VAULT_STORAGE_KEY);
    if (!raw) return { ok: false };
    const envelope = JSON.parse(raw) as StoredVaultEnvelope;
    if (envelope.v !== 1 || !envelope.salt || !envelope.iv || !envelope.ciphertext) {
      return { ok: false };
    }

    const saltBytes = fromBase64(envelope.salt);
    const { verifier, aesKey } = await deriveKeys(passphrase, saltBytes);
    if (verifier !== envelope.verifier) {
      return { ok: false };
    }

    const ivBytes = fromBase64(envelope.iv);
    const cipherBytes = fromBase64(envelope.ciphertext);
    const plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(ivBytes) },
      aesKey,
      toArrayBuffer(cipherBytes)
    );

    const decoded = new TextDecoder().decode(plainBuf);
    const payload = JSON.parse(decoded) as VaultPayload;
    clearLegacyPlaintextKeys();

    return {
      ok: true,
      session: {
        salt: envelope.salt,
        verifier,
        aesKey,
      },
      payload,
    };
  } catch {
    return { ok: false };
  }
}

export function wipeLocalVault(): void {
  try {
    localStorage.removeItem(VAULT_STORAGE_KEY);
    clearLegacyPlaintextKeys();
  } catch {
    // Ignore
  }
}
