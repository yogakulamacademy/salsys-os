"use client";

import Link from "next/link";
import { useState, type ChangeEvent } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, XCircle } from "lucide-react";

import {
  LEADS_IMPORT_CHUNK_SIZE,
  LEADS_IMPORT_TEMPLATE,
  MAX_LEADS_IMPORT_BYTES,
  MAX_LEADS_IMPORT_ROWS,
  parseLeadsImportCsv,
  type ImportCsvPreview,
} from "@/lib/leads-transfer-csv";

type ImportResult = {
  rowNumber: number;
  status: "created" | "skipped" | "failed";
  message: string;
};

export function LeadsImportClient({ enabled }: { enabled: boolean }) {
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportCsvPreview | null>(null);
  const [parseError, setParseError] = useState("");
  const [results, setResults] = useState<ImportResult[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [requestError, setRequestError] = useState("");

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPreview(null);
    setParseError("");
    setRequestError("");
    setResults([]);
    setProgress(0);
    setCompleted(false);
    setFileName(file?.name ?? "");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setParseError("Choose a .csv file.");
      return;
    }
    if (file.size > MAX_LEADS_IMPORT_BYTES) {
      setParseError("CSV exceeds 1 MB. Split it into smaller files.");
      return;
    }
    try {
      const data = await file.text();
      setPreview(parseLeadsImportCsv(data));
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "Unable to parse this CSV.");
    }
  }

  async function startImport() {
    if (!enabled || !preview?.rows.length || running || completed) return;
    setRunning(true);
    setRequestError("");
    setResults([]);
    setProgress(0);
    const collected: ImportResult[] = [];

    try {
      for (let start = 0; start < preview.rows.length; start += LEADS_IMPORT_CHUNK_SIZE) {
        const batch = preview.rows.slice(start, start + LEADS_IMPORT_CHUNK_SIZE);
        const response = await fetch("/api/leads/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          credentials: "same-origin",
          body: JSON.stringify({ rows: batch }),
        });
        const payload = await response.json() as {
          results?: ImportResult[];
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "Import request failed.");

        const returned = Array.isArray(payload.results) ? payload.results : [];
        if (
          returned.length !== batch.length ||
          returned.some((item, index) =>
            item.rowNumber !== batch[index].rowNumber ||
            !["created", "skipped", "failed"].includes(item.status)
          )
        ) {
          throw new Error("Server returned an incomplete batch result. Check imported leads before retrying.");
        }
        collected.push(...returned);
        setResults([...collected]);
        setProgress(Math.min(start + batch.length, preview.rows.length));
      }
      setCompleted(true);
    } catch (error) {
      setRequestError(
        (error instanceof Error ? error.message : "An unexpected error occurred.") +
        " Some earlier batches may have been saved. Review Leads before retrying to avoid duplicate records.",
      );
    } finally {
      setRunning(false);
    }
  }

  const created = results.filter(item => item.status === "created").length;
  const skipped = results.filter(item => item.status === "skipped").length;
  const failed = results.filter(item => item.status === "failed").length;

  return (
    <div className="mx-auto w-full max-w-[1000px] space-y-5 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/leads" className="inline-flex items-center gap-2 text-xs font-semibold text-copy-muted hover:text-brand-700">
          <ArrowLeft size={15} aria-hidden /> Back to Leads
        </Link>
        <a
          href={"data:text/csv;charset=utf-8," + encodeURIComponent("\uFEFF" + LEADS_IMPORT_TEMPLATE)}
          download="salsys-leads-import-template.csv"
          className="inline-flex min-h-10 items-center gap-2 rounded-ui border border-line bg-surface px-3 text-xs font-semibold text-copy-strong hover:border-brand-300 hover:text-brand-700"
        >
          <Download size={15} aria-hidden /> Download CSV template
        </a>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-brand-700 dark:text-brand-300">CRM / Leads</p>
        <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-copy-strong">Import leads</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-copy-muted">
          Upload a CSV file, review valid rows, then confirm. Existing leads will not be updated.
        </p>
      </div>

      <section className="rounded-2xl border border-line bg-surface p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-copy-strong">1. Upload CSV</h2>
            <p className="mt-1 text-xs text-copy-muted">Up to {MAX_LEADS_IMPORT_ROWS} leads and 1 MB per file.</p>
          </div>
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-medium text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">CSV only</span>
        </div>

        <label className="mt-4 flex min-h-[155px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-brand-200 bg-surface-muted/70 px-4 py-6 text-center transition hover:border-brand-400 dark:border-brand-900/60">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
            <FileSpreadsheet size={21} aria-hidden />
          </span>
          <span className="mt-3 text-xs font-semibold text-copy-strong">{fileName || "Choose a CSV file"}</span>
          <span className="mt-1 text-[11px] text-copy-muted">Select a file from your computer</span>
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="Choose CSV file"
            onChange={chooseFile}
            disabled={running}
            className="sr-only"
          />
        </label>

        {parseError ? (
          <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-xs text-rose-700 dark:bg-rose-950/25 dark:text-rose-300">
            <XCircle size={15} className="shrink-0" /> {parseError}
          </p>
        ) : null}

        <p className="mt-3 text-[11px] leading-5 text-copy-muted">
          Required: <strong>first_name</strong> and either <strong>email</strong> or <strong>phone</strong>. Optional columns:
          last_name, country, preferred_location, preferred_mode, lead_creation_channel, first_touch_source, notes.
          Missing source is marked “CSV Import.”
        </p>
      </section>

      {preview ? (
        <section className="rounded-2xl border border-line bg-surface p-4 sm:p-6" data-testid="leads-import-preview">
          <h2 className="text-sm font-semibold text-copy-strong">2. Review and confirm</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-surface-muted p-3">
              <div className="text-[22px] font-semibold tabular-nums text-copy-strong">{preview.rows.length}</div>
              <div className="mt-1 text-[11px] text-copy-muted">Valid rows</div>
            </div>
            <div className="rounded-xl bg-surface-muted p-3">
              <div className="text-[22px] font-semibold tabular-nums text-copy-strong">{preview.issues.length}</div>
              <div className="mt-1 text-[11px] text-copy-muted">Skipped before import</div>
            </div>
            <div className="rounded-xl bg-surface-muted p-3">
              <div className="text-[22px] font-semibold tabular-nums text-copy-strong">{preview.rows.length + preview.issues.length}</div>
              <div className="mt-1 text-[11px] text-copy-muted">CSV entries</div>
            </div>
          </div>

          {preview.issues.length ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
              <p className="flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-200"><AlertTriangle size={14} /> Rows requiring correction</p>
              <ul className="mt-2 space-y-1 text-[11px] text-amber-800 dark:text-amber-200">
                {preview.issues.slice(0, 8).map(item => (
                  <li key={item.rowNumber}>Row {item.rowNumber}: {item.message}</li>
                ))}
              </ul>
              {preview.issues.length > 8 ? <p className="mt-2 text-[11px] text-amber-800">And {preview.issues.length - 8} more rows.</p> : null}
              <p className="mt-2 text-[11px]">Invalid rows are excluded, not silently repaired.</p>
            </div>
          ) : null}

          {preview.rows.length ? (
            <div className="mt-4 overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="bg-surface-muted text-copy-muted">
                  <tr>
                    {["CSV row", "Name", "Email", "Phone", "Source"].map(label => (
                      <th key={label} className="px-3 py-2.5 font-semibold">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 5).map(row => (
                    <tr key={row.rowNumber} className="border-t border-line text-copy-strong">
                      <td className="px-3 py-2.5">{row.rowNumber}</td>
                      <td className="px-3 py-2.5">{row.first_name} {row.last_name}</td>
                      <td className="px-3 py-2.5">{row.email || "—"}</td>
                      <td className="px-3 py-2.5">{row.phone || "—"}</td>
                      <td className="px-3 py-2.5">{row.first_touch_source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.rows.length > 5 ? <p className="border-t border-line px-3 py-2 text-[11px] text-copy-muted">Showing the first five valid rows.</p> : null}
            </div>
          ) : null}

          <p className="mt-4 text-[11px] leading-5 text-copy-muted">
            Contacts already present in the active workspace will be skipped where accessible through authorized duplicate checks.
            Imported leads are new records; existing records are not overwritten. Interrupted imports can be partially saved.
          </p>

          {!completed ? (
            <button
              type="button"
              disabled={!enabled || running || !preview.rows.length || Boolean(requestError)}
              onClick={startImport}
              className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-ui bg-brand-700 px-5 text-xs font-semibold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {running ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Upload size={15} aria-hidden />}
              {running ? "Importing..." : "Confirm import " + preview.rows.length + " leads"}
            </button>
          ) : null}
          {running ? (
            <p role="status" aria-live="polite" className="mt-2 text-xs text-copy-muted">Processed {progress} of {preview.rows.length} valid rows.</p>
          ) : null}
          {requestError ? (
            <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-200">
              {requestError}
            </div>
          ) : null}
          {results.length ? (
            <div aria-live="polite" className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-surface-muted p-3 text-xs">
              <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300"><CheckCircle2 size={15} /> {created} created</span>
              <span className="text-copy-muted">{skipped} existing contacts skipped</span>
              <span className="text-rose-700 dark:text-rose-300">{failed} failed</span>
            </div>
          ) : null}
          {completed ? (
            <div className="mt-4">
              <p role="status" className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Import finished. Review your new leads in the workspace.</p>
              <Link href="/leads" className="mt-2 inline-flex min-h-10 items-center text-xs font-semibold text-brand-700 dark:text-brand-300">Open Leads</Link>
              {results.some(item => item.status === "failed") ? (
                <ul className="mt-3 space-y-1 text-[11px] text-rose-700 dark:text-rose-300">
                  {results.filter(item => item.status === "failed").slice(0, 15).map(item => (
                    <li key={item.rowNumber}>Row {item.rowNumber}: {item.message}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
