import React, { useMemo, useState } from "react";
import {
  X,
  KeyRound,
  Sparkles,
  Copy,
  Check,
  Eye,
  EyeOff,
  ShieldCheck,
  Lock,
  AlertTriangle,
} from "lucide-react";
import {
  ActiveVaultSession,
  createVault,
  evaluatePassphraseStrength,
  generateStrongPassphrase,
  MIN_PASSPHRASE_LENGTH,
  VaultPayload,
} from "../utils/secureVault";

interface SecuritySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverProtected: boolean;
  currentPayload: VaultPayload;
  onVaultRotated: (nextSession: ActiveVaultSession) => void;
  onLockNow: () => void;
}

export const SecuritySettingsModal: React.FC<SecuritySettingsModalProps> = ({
  isOpen,
  onClose,
  serverProtected,
  currentPayload,
  onVaultRotated,
  onLockNow,
}) => {
  const [newPassphrase, setNewPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [vercelSecretPreview, setVercelSecretPreview] = useState("");
  const [copiedVercel, setCopiedVercel] = useState(false);
  const [copiedNew, setCopiedNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const strength = useMemo(
    () => evaluatePassphraseStrength(newPassphrase),
    [newPassphrase]
  );

  if (!isOpen) return null;

  const handleGenerateNew = () => {
    const g = generateStrongPassphrase(28);
    setNewPassphrase(g);
    setConfirmPassphrase(g);
    setShowSecret(true);
    setError(null);
    setSuccess(null);
  };

  const handleGenerateVercelSecret = () => {
    setVercelSecretPreview(generateStrongPassphrase(35));
    setCopiedVercel(false);
  };

  const handleCopy = async (text: string, which: "new" | "vercel") => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (which === "new") {
        setCopiedNew(true);
        setTimeout(() => setCopiedNew(false), 2000);
      } else {
        setCopiedVercel(true);
        setTimeout(() => setCopiedVercel(false), 2000);
      }
    } catch {
      // Ignore
    }
  };

  const handleRotatePassphrase = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassphrase.length < MIN_PASSPHRASE_LENGTH) {
      setError(`الحد الأدنى للرمز السري هو ${MIN_PASSPHRASE_LENGTH} حرفاً.`);
      return;
    }
    if (newPassphrase !== confirmPassphrase) {
      setError("الرمز السري وتأكيده غير متطابقين.");
      return;
    }

    setSaving(true);
    try {
      const nextSession = await createVault(newPassphrase, currentPayload);
      onVaultRotated(nextSession);
      setNewPassphrase("");
      setConfirmPassphrase("");
      setSuccess("تم تحديث الرمز السري وإعادة تشفير الخزنة بنجاح.");
    } catch {
      setError("تعذر إعادة تشفير الخزنة.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-700" />
            <h2 className="text-base font-bold text-slate-900">
              إعدادات الأمان والرمز السري الخاص
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Status Summary */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800">
                تشفير الخزنة المحلية (الطلاب والنتائج):
              </span>
              <span className="font-mono-num font-bold text-emerald-800">
                AES-256-GCM نشط
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800">
                حماية الخادم على فيرسيل (APP_ACCESS_SECRET):
              </span>
              <span
                className={`font-bold ${
                  serverProtected ? "text-emerald-800" : "text-amber-700"
                }`}
              >
                {serverProtected ? "مفعّلة عالمياً" : "تشفير محلي فقط"}
              </span>
            </div>
          </div>

          {/* Lock Now Action */}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3.5">
            <div>
              <div className="text-sm font-bold text-slate-900">
                قفل الجلسة الحالية فوراً
              </div>
              <div className="text-xs text-slate-500">
                يقفل التطبيق ويمسح البيانات المفكوكة من الذاكرة حتى إدخال الرمز.
              </div>
            </div>
            <button
              type="button"
              onClick={onLockNow}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Lock className="w-3.5 h-3.5" />
              قفل الآن
            </button>
          </div>

          {/* Change Passphrase Form */}
          <form
            onSubmit={handleRotatePassphrase}
            className="space-y-3 border-t border-slate-100 pt-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                تغيير الرمز السري للخزنة المحلية
              </h3>
              <button
                type="button"
                onClick={handleGenerateNew}
                className="inline-flex items-center gap-1 rounded border border-emerald-700 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
              >
                <Sparkles className="w-3.5 h-3.5" />
                توليد رمز 28 حرفاً
              </button>
            </div>

            <div className="relative">
              <input
                type={showSecret ? "text" : "password"}
                dir="ltr"
                value={newPassphrase}
                onChange={(e) => setNewPassphrase(e.target.value)}
                placeholder={`رمز سري جديد (${MIN_PASSPHRASE_LENGTH} حرفاً على الأقل)`}
                autoComplete="new-password"
                className="w-full rounded-md border border-slate-300 pl-10 pr-3 py-2 text-sm font-mono-num"
              />
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                {showSecret ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span
                className={
                  strength.isLongEnough
                    ? "text-emerald-800 font-semibold"
                    : "text-amber-700 font-semibold"
                }
              >
                {strength.label}
              </span>
              {newPassphrase && (
                <button
                  type="button"
                  onClick={() => handleCopy(newPassphrase, "new")}
                  className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900"
                >
                  {copiedNew ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-700" />
                      تم النسخ
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      نسخ
                    </>
                  )}
                </button>
              )}
            </div>

            <input
              type={showSecret ? "text" : "password"}
              dir="ltr"
              value={confirmPassphrase}
              onChange={(e) => setConfirmPassphrase(e.target.value)}
              placeholder="تأكيد الرمز السري الجديد..."
              autoComplete="new-password"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono-num"
            />

            {error && (
              <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800 flex items-center gap-1.5">
                <Check className="w-4 h-4 shrink-0" />
                <span>{success}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-800 px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-50"
            >
              <KeyRound className="w-4 h-4" />
              {saving ? "جارٍ التحديث..." : "حفظ الرمز الجديد وإعادة التشفير"}
            </button>
          </form>

          {/* Vercel Global Protection Helper */}
          <div className="border-t border-slate-100 pt-4 space-y-2.5">
            <h3 className="text-sm font-bold text-slate-900">
              قفل رابط فيرسيل بالكامل (حماية من أي جهاز آخر)
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              لجعل رابط فيرسيل خاصاً بك وحدك على أي جهاز جديد، أضف متغير البيئة{" "}
              <span className="font-mono-num font-bold text-slate-900">
                APP_ACCESS_SECRET
              </span>{" "}
              في إعدادات مشروعك على Vercel ثم أعد النشر (Redeploy).
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleGenerateVercelSecret}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                توليد رمز طويل لـ Vercel
              </button>
              {vercelSecretPreview && (
                <button
                  type="button"
                  onClick={() => handleCopy(vercelSecretPreview, "vercel")}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-700 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-900"
                >
                  {copiedVercel ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
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
            {vercelSecretPreview && (
              <div
                dir="ltr"
                className="rounded border border-slate-200 bg-slate-50 px-3 py-2 font-mono-num text-xs text-slate-900 select-all break-all"
              >
                {vercelSecretPreview}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
