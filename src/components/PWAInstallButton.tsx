import React, { useState } from "react";
import { Download } from "lucide-react";
import { usePWAInstall } from "../hooks/usePWAInstall";

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  compact = false,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={`inline-flex items-center gap-1.5 rounded-md border border-emerald-700 bg-emerald-50 font-semibold text-emerald-900 hover:bg-emerald-100 transition-colors whitespace-nowrap shrink-0 ${
          compact ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-xs sm:text-sm"
        }`}
      >
        <Download className="w-3.5 h-3.5" />
        تثبيت التطبيق
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 ${
            compact ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-xs sm:text-sm"
          }`}
        >
          <Download className="w-3.5 h-3.5" />
          تثبيت على iPhone / iPad
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
            <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl border border-slate-200 space-y-3 text-right">
              <h3 className="text-base font-bold text-slate-900">
                تثبيت التطبيق على iPhone / iPad
              </h3>
              <ol className="text-xs sm:text-sm text-slate-700 space-y-2 list-decimal list-inside leading-relaxed">
                <li>
                  اضغط على زر <strong>المشاركة (Share)</strong> في شريط Safari.
                </li>
                <li>
                  مرر للأسفل واختر{" "}
                  <strong>إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong>.
                </li>
                <li>اضغط <strong>إضافة (Add)</strong> لفتحه كتطبيق مستقل.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full rounded-md bg-emerald-800 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-emerald-900"
              >
                حسناً
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
