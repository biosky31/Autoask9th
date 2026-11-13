import React, { useMemo, useState } from "react";
import {
  Lock,
  ShieldCheck,
  KeyRound,
  Eye,
  EyeOff,
  Copy,
  Check,
  Sparkles,
  AlertTriangle,
  Loader2,
  Trash2,
} from "lucide-react";
import {
  ActiveVaultSession,
  createVault,
  evaluatePassphraseStrength,
  generateStrongPassphrase,
  hasLocalVault,
  loadLegacyOrInitialPayload,
  MIN_PASSPHRASE_LENGTH,
  unlockVault,
  VaultPayload,
  wipeLocalVault,
} from "../utils/secureVault";
import { PWAInstallButton } from "./PWAInstallButton";

interface PasscodeLockScreenProps {
  serverProtected: boolean;
  serverAuthenticated: boolean;
  onUnlocked: (session: ActiveVaultSession, payload: VaultPayload) => void;
}

export const PasscodeLockScreen: React.FC<PasscodeLockScreenProps> = ({
  serverProtected,
  serverAuthenticated,
  onUnlocked,
}) => {
  const [vaultExists, setVaultExists] = useState<boolean>(() => hasLocalVault());
  const isFirstTimeSetup = !serverProtected && !vaultExists;

  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedCount, setFailedCount] = useState(0);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const strength = useMemo(
    () => evaluatePassphraseStrength(passphrase),
    [passphrase]
  );

  const handleGenerate = () => {
    const generated = generateStrongPassphrase(28);
    setPassphrase(generated);
    setConfirmPassphrase(generated);
    setShowSecret(true);
    setSavedConfirmed(false);
    setError(null);
  };

  const handleCopy = async () => {
    if (!passphrase) return;
    try {
      await navigator.clipboard.writeText(passphrase);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
      setError(
        `يجب أن لا يقل الرمز السري عن ${MIN_PASSPHRASE_LENGTH} حرفاً لضمان أعلى حماية.`
      );
      return;
    }
    if (passphrase !== confirmPassphrase) {
      setError("الرمز السري وتأكيده غير متطابقين.");
      return;
    }
    if (!savedConfirmed) {
      setError("يرجى تأكيد أنك حفظت الرمز السري في مكان آمن.");
      return;
    }

    setLoading(true);
    try {
      const initialPayload = loadLegacyOrInitialPayload();
      const session = await createVault(passphrase, initialPayload);
      setPassphrase("");
      setConfirmPassphrase("");
      onUnlocked(session, initialPayload);
    } catch {
      setError("تعذر إنشاء الخزنة المشفرة على هذا المتصفح.");
    } finally {
      setLoading(false);
    }
  };

  const handleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!passphrase.trim()) {
      setError("يرجى إدخال الرمز السري الطويل.");
      return;
    }

    setLoading(true);
    try {
      // 1. If server protection (APP_ACCESS_SECRET on Vercel/Node) is active, verify on server first
      if (serverProtected && !serverAuthenticated) {
        try {
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ passphrase }),
          });
          const data = (await res.json()) as { ok?: boolean; error?: string };
          if (!res.ok) {
            setFailedCount((c) => c + 1);
            setError(data.error || "الرمز السري غير صحيح.");
            setLoading(false);
            return;
          }
        } catch {
          // If offline in installed PWA, fall back to local encrypted vault verification if vault exists
          if (!vaultExists) {
            setError("تعذر الاتصال بالخادم للتحقق من الرمز السري.");
            setLoading(false);
            return;
          }
        }
      }

      // 2. Decrypt local AES-256-GCM vault or initialize it on first login on this device
      if (vaultExists) {
        const res = await unlockVault(passphrase);
        if (!res.ok) {
          setFailedCount((c) => c + 1);
          setError(
            serverProtected
              ? "تم التحقق من الخادم، لكن هذا المتصفح مشفر برمز محلي مختلف. يمكنك إعادة تعيين الخزنة المحلية أو إدخال الرمز المحلي السابق."
              : "الرمز السري غير صحيح. يرجى التأكد من الأحرف الكبيرة والصغيرة."
          );
          setLoading(false);
          return;
        }
        setPassphrase("");
        onUnlocked(res.session, res.payload);
      } else {
        const initialPayload = loadLegacyOrInitialPayload();
        const session = await createVault(passphrase, initialPayload);
        setPassphrase("");
        onUnlocked(session, initialPayload);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleWipeVault = () => {
    wipeLocalVault();
    setVaultExists(false);
    setShowResetConfirm(false);
    setPassphrase("");
    setConfirmPassphrase("");
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center px-4 py-8">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {/* Top Security Header */}
        <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-800/80 border border-emerald-500/40 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold font-display">
                مدارس إشراق اليمن · وصول خاص
              </h1>
              <p className="text-xs text-slate-300">
                إشراف الأستاذ إبراهيم · محمي بالتشفير
              </p>
            </div>
          </div>
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
        </div>

        <div className="p-6 space-y-5">
          {isFirstTimeSetup ? (
            <form onSubmit={handleSetupSubmit} className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-base font-bold text-slate-900">
                  إعداد الرمز السري الطويل والآمن
                </h2>
                <p className="text-xs text-slate-600 leading-relaxed">
                  لحماية بيانات الطلاب ومفاتيح الإجابة، أنشئ رمزاً سرياً طويلاً (على الأقل{" "}
                  <span className="font-mono-num font-bold">
                    {MIN_PASSPHRASE_LENGTH}
                  </span>{" "}
                  حرفاً). يتم تشفير جميع البيانات محلياً بتقنية{" "}
                  <span className="font-mono-num font-semibold">AES-256-GCM</span>.
                </p>
              </div>

              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleGenerate}
                  className="inline-flex items-center gap-1.5 rounded-md border border-emerald-700 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  توليد رمز سري آمن (28 حرفاً)
                </button>
                {passphrase && (
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-700" />
                        تم النسخ
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        نسخ الرمز
                      </>
                    )}
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-800">
                  الرمز السري الطويل (الحد الأدنى {MIN_PASSPHRASE_LENGTH} حرفاً)
                </label>
                <div className="relative">
                  <input
                    type={showSecret ? "text" : "password"}
                    dir="ltr"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder="أدخل رمزاً سرياً طويلاً أو اضغط زر التوليد..."
                    autoComplete="new-password"
                    className="w-full rounded-md border border-slate-300 bg-white pl-10 pr-3 py-2.5 text-sm font-mono-num text-slate-900 focus:border-emerald-700 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((v) => !v)}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    title={showSecret ? "إخفاء" : "إظهار"}
                  >
                    {showSecret ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* Strength Bar */}
                <div className="flex items-center justify-between text-[11px] pt-0.5">
                  <span
                    className={`font-semibold ${
                      strength.isLongEnough
                        ? "text-emerald-800"
                        : "text-amber-700"
                    }`}
                  >
                    {strength.label}
                  </span>
                  <span className="font-mono-num text-slate-500">
                    {strength.length} / {MIN_PASSPHRASE_LENGTH}+ حرف
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-800">
                  تأكيد الرمز السري
                </label>
                <input
                  type={showSecret ? "text" : "password"}
                  dir="ltr"
                  value={confirmPassphrase}
                  onChange={(e) => setConfirmPassphrase(e.target.value)}
                  placeholder="أعد كتابة الرمز السري..."
                  autoComplete="new-password"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm font-mono-num text-slate-900 focus:border-emerald-700 focus:outline-none"
                />
              </div>

              <label className="flex items-start gap-2.5 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={savedConfirmed}
                  onChange={(e) => setSavedConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-emerald-700 shrink-0"
                />
                <span>
                  قمت بنسخ وحفظ الرمز السري في مكان آمن (ملاحظة: لحظر أي جهاز آخر على رابط فيرسيل أضف نفس الرمز في متغير البيئة{" "}
                  <span className="font-mono-num font-semibold">APP_ACCESS_SECRET</span>
                  ).
                </span>
              </label>

              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900 transition-colors disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    جارٍ تشفير الخزنة...
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    حفظ الرمز وتشفير التطبيق
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleUnlockSubmit} className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-base font-bold text-slate-900">
                  التطبيق مقفل برمز سري خاص
                </h2>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {serverProtected
                    ? "هذا التطبيق محمي على الخادم والهاتف. أدخل الرمز السري الطويل لفتح الجلسة وفك تشفير البيانات."
                    : "أدخل الرمز السري الطويل لفك تشفير بيانات الطلاب والاختبارات على هذا الجهاز."}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-800">
                  الرمز السري
                </label>
                <div className="relative">
                  <input
                    type={showSecret ? "text" : "password"}
                    dir="ltr"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder="أدخل الرمز السري الطويل..."
                    autoComplete="current-password"
                    autoFocus
                    className="w-full rounded-md border border-slate-300 bg-white pl-10 pr-3 py-2.5 text-sm font-mono-num text-slate-900 focus:border-emerald-700 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((v) => !v)}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    title={showSecret ? "إخفاء" : "إظهار"}
                  >
                    {showSecret ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900 transition-colors disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    جارٍ التحقق وفك التشفير...
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    فتح التطبيق
                  </>
                )}
              </button>

              {vaultExists && (failedCount >= 2 || showResetConfirm) && (
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  {!showResetConfirm ? (
                    <button
                      type="button"
                      onClick={() => setShowResetConfirm(true)}
                      className="text-xs text-red-700 hover:underline"
                    >
                      نسيت الرمز السري المحلي؟ تصفير الخزنة المحلية
                    </button>
                  ) : (
                    <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-2">
                      <p className="text-xs text-red-800 leading-relaxed">
                        تنبيه: تصفير الخزنة المحلية سيحذف جميع قوائم الطلاب والنتائج المحفوظة على هذا الجهاز نهائياً ولا يمكن استرجاعها.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleWipeVault}
                          className="inline-flex items-center gap-1 rounded bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          تأكيد الحذف وإعادة التعيين
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowResetConfirm(false)}
                          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                        >
                          إلغاء
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </form>
          )}

          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500">
              تشفير PBKDF2-SHA256 + AES-256-GCM
            </span>
            <PWAInstallButton compact />
          </div>
        </div>
      </div>
    </div>
  );
};
