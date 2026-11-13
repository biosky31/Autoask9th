import React, { useMemo, useState } from "react";
import {
  Download,
  Search,
  Trash2,
  Eye,
  X,
  BarChart3,
  ScanLine,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import type { ScannedResult } from "../types/omr";

interface ResultsDashboardViewProps {
  results: ScannedResult[];
  onDeleteResult: (id: string) => void;
  onUpdateEssayScore: (id: string, essayScore: number) => void;
  onClearAll: () => void;
  onGoToScanner: () => void;
}

export const ResultsDashboardView: React.FC<ResultsDashboardViewProps> = ({
  results,
  onDeleteResult,
  onUpdateEssayScore,
  onClearAll,
  onGoToScanner,
}) => {
  const [search, setSearch] = useState("");
  const [committeeFilter, setCommitteeFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all");
  const [inspected, setInspected] = useState<ScannedResult | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const committees = useMemo(
    () => Array.from(new Set(results.map((r) => r.committeeName))),
    [results]
  );
  const models = useMemo(
    () => Array.from(new Set(results.map((r) => r.modelCode))),
    [results]
  );

  const filtered = useMemo(() => {
    return results.filter((r) => {
      if (committeeFilter !== "all" && r.committeeName !== committeeFilter)
        return false;
      if (modelFilter !== "all" && r.modelCode !== modelFilter) return false;
      if (
        search.trim() &&
        !r.studentName.toLowerCase().includes(search.trim().toLowerCase()) &&
        !r.committeeName.toLowerCase().includes(search.trim().toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [results, committeeFilter, modelFilter, search]);

  const stats = useMemo(() => {
    if (filtered.length === 0) {
      return { count: 0, avgPct: 0, maxScore: 0, maxPossible: 0, passRate: 0 };
    }
    const avgPct =
      Math.round(
        (filtered.reduce((acc, r) => acc + r.percentage, 0) / filtered.length) *
          10
      ) / 10;
    const best = filtered.reduce((a, b) =>
      a.autoScore >= b.autoScore ? a : b
    );
    const passed = filtered.filter((r) => r.percentage >= 50).length;
    const passRate = Math.round((passed / filtered.length) * 1000) / 10;
    return {
      count: filtered.length,
      avgPct,
      maxScore: best.autoScore,
      maxPossible: best.autoMaxScore,
      passRate,
    };
  }, [filtered]);

  const committeeSummary = useMemo(() => {
    const map = new Map<
      string,
      { name: string; count: number; pctSum: number; passed: number }
    >();
    for (const r of filtered) {
      const cur = map.get(r.committeeName) ?? {
        name: r.committeeName,
        count: 0,
        pctSum: 0,
        passed: 0,
      };
      cur.count++;
      cur.pctSum += r.percentage;
      if (r.percentage >= 50) cur.passed++;
      map.set(r.committeeName, cur);
    }
    return Array.from(map.values()).map((c) => ({
      ...c,
      avgPct: Math.round((c.pctSum / c.count) * 10) / 10,
    }));
  }, [filtered]);

  const hardestQuestions = useMemo(() => {
    const qMap = new Map<
      number,
      { num: number; attempts: number; wrongOrBlank: number }
    >();
    for (const r of filtered) {
      for (const q of r.questions) {
        const cur = qMap.get(q.num) ?? {
          num: q.num,
          attempts: 0,
          wrongOrBlank: 0,
        };
        cur.attempts++;
        if (q.status !== "correct") cur.wrongOrBlank++;
        qMap.set(q.num, cur);
      }
    }
    return Array.from(qMap.values())
      .map((x) => ({
        ...x,
        missRate: Math.round((x.wrongOrBlank / x.attempts) * 100),
      }))
      .filter((x) => x.missRate > 0)
      .sort((a, b) => b.missRate - a.missRate)
      .slice(0, 6);
  }, [filtered]);

  const handleExportCsv = () => {
    const header = [
      "اسم الطالب",
      "اسم اللجنة",
      "رقم النموذج",
      "المادة",
      "الدرجة الآلية",
      "الدرجة العظمى الآلية",
      "درجة التعبير",
      "المجموع الكلي",
      "النسبة المئوية",
      "صحيح",
      "خطأ",
      "فارغ",
      "مزدوج",
      "وقت التصحيح",
    ];
    const rows = filtered.map((r) => [
      r.studentName,
      r.committeeName,
      r.modelCode,
      r.subject,
      r.autoScore,
      r.autoMaxScore,
      r.essayScore,
      r.totalScore,
      `${r.percentage}%`,
      r.correctCount,
      r.wrongCount,
      r.blankCount,
      r.multipleCount,
      new Date(r.timestamp).toLocaleString("ar-YE"),
    ]);

    const csv =
      "\uFEFF" +
      [header, ...rows]
        .map((row) =>
          row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
        )
        .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `نتائج_مدارس_اشراق_اليمن_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (results.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg py-20 px-6 text-center space-y-4">
        <BarChart3 className="w-10 h-10 text-slate-400 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900">
          لا توجد أوراق مصححة مسجلة بعد
        </h2>
        <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
          ستظهر هنا نتائج الطلاب، وإحصاءات اللجان، وتحليل الأسئلة بمجرد مسح أول ورقة تظليل وحفظها.
        </p>
        <button
          type="button"
          onClick={onGoToScanner}
          className="inline-flex items-center gap-2 rounded-md bg-emerald-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900 transition-colors"
        >
          <ScanLine className="w-4 h-4" />
          الانتقال إلى الماسح الضوئي
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500">الأوراق المصححة</div>
          <div className="text-2xl font-bold font-mono-num text-slate-900 mt-1">
            {stats.count}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500">متوسط التحصيل</div>
          <div className="text-2xl font-bold font-mono-num text-emerald-800 mt-1">
            {stats.avgPct}%
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500">أعلى درجة آلية</div>
          <div className="text-2xl font-bold font-mono-num text-slate-900 mt-1">
            {stats.maxScore}{" "}
            <span className="text-sm font-normal text-slate-500">
              / {stats.maxPossible}
            </span>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500">نسبة النجاح (≥ 50%)</div>
          <div className="text-2xl font-bold font-mono-num text-slate-900 mt-1">
            {stats.passRate}%
          </div>
        </div>
      </div>

      {/* Filters & Export Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[260px]">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث باسم الطالب أو اللجنة..."
              className="w-full rounded-md border border-slate-300 pr-9 pl-3 py-2 text-sm focus:border-emerald-700 focus:outline-none"
            />
          </div>

          <select
            value={committeeFilter}
            onChange={(e) => setCommitteeFilter(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
          >
            <option value="all">جميع اللجان ({committees.length})</option>
            {committees.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
          >
            <option value="all">جميع النماذج ({models.length})</option>
            {models.map((m) => (
              <option key={m} value={m}>
                نموذج {m}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900 transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            تصدير كشف CSV
          </button>

          {!confirmClear ? (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Trash2 className="w-4 h-4" />
              مسح السجل
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onClearAll();
                  setConfirmClear(false);
                }}
                className="rounded-md bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700"
              >
                تأكيد الحذف
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="rounded-md border border-slate-300 px-2.5 py-2 text-xs text-slate-700"
              >
                إلغاء
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Analytics Split: Committees & Hardest Questions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-bold text-slate-900">
            أداء اللجان الامتحانية
          </h3>
          <div className="divide-y divide-slate-100">
            {committeeSummary.map((c) => (
              <div key={c.name} className="py-2.5 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800">{c.name}</span>
                  <span className="font-mono-num text-slate-600">
                    {c.count} طالب · متوسط {c.avgPct}%
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-700 rounded-full"
                    style={{ width: `${Math.min(100, c.avgPct)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-bold text-slate-900">
            الفقرات الأكثر تعثراً لدى الطلاب
          </h3>
          {hardestQuestions.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">
              لم تُسجل أخطاء في الفقرات ضمن الفلتر الحالي.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {hardestQuestions.map((hq) => (
                <div
                  key={hq.num}
                  className="py-2 flex items-center justify-between text-xs"
                >
                  <span className="font-semibold text-slate-800">
                    السؤال رقم{" "}
                    <span className="font-mono-num">{hq.num}</span>
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-500 font-mono-num">
                      {hq.wrongOrBlank} من {hq.attempts}
                    </span>
                    <span className="font-mono-num font-bold text-red-700">
                      نسبة الخطأ {hq.missRate}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
              <tr>
                <th className="py-3 px-4">اسم الطالب</th>
                <th className="py-3 px-4">اسم اللجنة</th>
                <th className="py-3 px-4">النموذج</th>
                <th className="py-3 px-4">الدرجة الآلية</th>
                <th className="py-3 px-4">التعبير</th>
                <th className="py-3 px-4">المجموع</th>
                <th className="py-3 px-4">النسبة</th>
                <th className="py-3 px-4">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-2.5 px-4 font-semibold text-slate-900">
                    {r.studentName}
                  </td>
                  <td className="py-2.5 px-4 text-slate-700">
                    {r.committeeName}
                  </td>
                  <td className="py-2.5 px-4 font-mono-num font-semibold text-slate-800">
                    {r.modelCode}
                  </td>
                  <td className="py-2.5 px-4 font-mono-num">
                    {r.autoScore} / {r.autoMaxScore}
                  </td>
                  <td className="py-2.5 px-4 font-mono-num">
                    {r.essayMaxScore > 0 ? `${r.essayScore} / ${r.essayMaxScore}` : "—"}
                  </td>
                  <td className="py-2.5 px-4 font-mono-num font-bold text-slate-900">
                    {r.totalScore} / {r.totalMaxScore}
                  </td>
                  <td className="py-2.5 px-4 font-mono-num">
                    <span
                      className={`font-semibold ${
                        r.percentage >= 50 ? "text-emerald-700" : "text-red-700"
                      }`}
                    >
                      {r.percentage}%
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setInspected(r)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:underline"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        تفاصيل
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteResult(r.id)}
                        className="text-slate-400 hover:text-red-600 p-1"
                        title="حذف النتيجة"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inspection Modal */}
      {inspected && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  ورقة الطالب: {inspected.studentName}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {inspected.committeeName} · نموذج {inspected.modelCode} ·{" "}
                  {new Date(inspected.timestamp).toLocaleString("ar-YE")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspected(null)}
                className="p-1.5 rounded hover:bg-slate-100 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                {inspected.annotatedImageUrl ? (
                  <img
                    src={inspected.annotatedImageUrl}
                    alt="الورقة المصححة"
                    className="w-full border border-slate-200 rounded-md"
                  />
                ) : (
                  <div className="border border-slate-200 rounded-md p-8 text-center text-xs text-slate-500">
                    لا توجد صورة محفوظة لهذه النتيجة
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {inspected.essayMaxScore > 0 && (
                  <div className="border border-slate-200 rounded-md p-3 bg-slate-50 flex items-center justify-between gap-3">
                    <label className="text-xs font-semibold text-slate-800">
                      تعديل درجة التعبير (من {inspected.essayMaxScore}):
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={inspected.essayMaxScore}
                      step={0.5}
                      value={inspected.essayScore}
                      onChange={(e) => {
                        const val = Math.max(
                          0,
                          Math.min(
                            inspected.essayMaxScore,
                            Number(e.target.value)
                          )
                        );
                        onUpdateEssayScore(inspected.id, val);
                        setInspected({
                          ...inspected,
                          essayScore: val,
                          totalScore: inspected.autoScore + val,
                        });
                      }}
                      className="w-20 rounded border border-slate-300 bg-white px-2.5 py-1 text-sm font-mono-num text-center"
                    />
                  </div>
                )}

                <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-md">
                  <table className="w-full text-xs text-right">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
                      <tr>
                        <th className="py-2 px-3">س</th>
                        <th className="py-2 px-3">إجابة الطالب</th>
                        <th className="py-2 px-3">الصحيحة</th>
                        <th className="py-2 px-3">الحالة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {inspected.questions.map((q) => {
                        const fmt = (v: number | null) =>
                          v === null
                            ? "فارغ"
                            : v === -1
                            ? "مزدوج"
                            : q.type === "tf"
                            ? v === 1
                              ? "ص"
                              : "خ"
                            : String(v);
                        return (
                          <tr key={q.num}>
                            <td className="py-1.5 px-3 font-mono-num font-semibold">
                              {q.num}
                            </td>
                            <td className="py-1.5 px-3 font-mono-num">
                              {fmt(q.marked)}
                            </td>
                            <td className="py-1.5 px-3 font-mono-num font-bold">
                              {fmt(q.correctAnswer)}
                            </td>
                            <td className="py-1.5 px-3">
                              {q.status === "correct" && (
                                <span className="inline-flex items-center gap-1 text-emerald-700">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> صحيح
                                </span>
                              )}
                              {q.status === "wrong" && (
                                <span className="inline-flex items-center gap-1 text-red-700">
                                  <XCircle className="w-3.5 h-3.5" /> خطأ
                                </span>
                              )}
                              {(q.status === "blank" || q.status === "multiple") && (
                                <span className="inline-flex items-center gap-1 text-amber-700">
                                  <AlertTriangle className="w-3.5 h-3.5" />{" "}
                                  {q.status === "blank" ? "متروك" : "مزدوج"}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
