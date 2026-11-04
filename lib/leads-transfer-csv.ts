export const LEADS_IMPORT_COLUMNS = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "country",
  "preferred_location",
  "preferred_mode",
  "lead_creation_channel",
  "first_touch_source",
  "notes",
] as const;

export const MAX_LEADS_IMPORT_ROWS = 500;
export const MAX_LEADS_IMPORT_BYTES = 1_000_000;
export const LEADS_IMPORT_CHUNK_SIZE = 20;

export type ImportLeadRow = {
  rowNumber: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  country: string;
  preferred_location: string;
  preferred_mode: string;
  lead_creation_channel: string;
  first_touch_source: string;
  notes: string;
};

export const LEADS_IMPORT_TEMPLATE =
  LEADS_IMPORT_COLUMNS.join(",") +
  "\n" +
  "Jane,Doe,jane@example.com,+15551234567,United States,Online,Online,other,CSV Import,Interested in training\n";

export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  // Defend against spreadsheet formula execution, including cells with leading whitespace.
  if (/^[\u0000-\u0020]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}

/** Only the separately-authorized PII role may export contact values.
 * Protected fields are blank (not masked or inferred) for other Sales managers.
 * The companion availability field tells recipients why contacts are absent. */
export function exportContactCells(
  lead: { email?: string; phone?: string; contactAvailability?: string },
  canViewContacts: boolean,
): [string, string, string] {
  if (!canViewContacts) return ["", "", "restricted"];
  return [
    lead.email ?? "",
    lead.phone ?? "",
    lead.contactAvailability ?? "missing",
  ];
}

function parseMatrix(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let closedQuote = false;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      if (cell !== "" || closedQuote) throw new Error("Malformed CSV quoting.");
      quoted = true;
      continue;
    }
    if (char === "," || char === "\n" || char === "\r") {
      row.push(cell);
      cell = "";
      closedQuote = false;
      if (char !== ",") {
        if (row.some(value => value.trim())) rows.push(row);
        row = [];
        if (char === "\r" && source[i + 1] === "\n") i++;
      }
      continue;
    }
    if (closedQuote && !/\s/.test(char)) throw new Error("Unexpected text after a quoted CSV value.");
    if (!closedQuote) cell += char;
  }
  if (quoted) throw new Error("Unterminated quoted CSV value.");
  row.push(cell);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

const MAX_FIELD_LENGTH: Record<string, number> = {
  first_name: 100,
  last_name: 100,
  email: 254,
  phone: 40,
  country: 120,
  preferred_location: 120,
  preferred_mode: 50,
  lead_creation_channel: 50,
  first_touch_source: 160,
  notes: 2000,
};

const CHANNELS = new Set(["website", "instagram", "whatsapp", "email", "phone", "meta_lead_form", "other"]);

export function validateImportRow(value: unknown): { row: ImportLeadRow | null; error: string | null } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { row: null, error: "Invalid row." };
  }
  const input = value as Record<string, unknown>;
  const rowNumber = Number(input.rowNumber);
  if (!Number.isSafeInteger(rowNumber) || rowNumber < 2 || rowNumber > MAX_LEADS_IMPORT_ROWS + 1) {
    return { row: null, error: "Invalid CSV row number." };
  }
  const row = { rowNumber } as ImportLeadRow;
  for (const field of LEADS_IMPORT_COLUMNS) {
    const v = input[field];
    if (v != null && typeof v !== "string") return { row: null, error: field + " must be text." };
    const value = (v ?? "").toString().trim();
    if (value.length > MAX_FIELD_LENGTH[field]) {
      return { row: null, error: field + " is too long (max " + MAX_FIELD_LENGTH[field] + ")." };
    }
    row[field] = value;
  }
  if (!row.first_name) return { row: null, error: "First name is required." };
  if (!row.email && !row.phone) return { row: null, error: "Email or phone is required." };
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
    return { row: null, error: "Invalid email address." };
  }
  if (row.phone) {
    const digits = row.phone.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 16 || !/^[+\d\s().-]+$/.test(row.phone)) {
      return { row: null, error: "Invalid phone number." };
    }
  }
  if (row.lead_creation_channel && !CHANNELS.has(row.lead_creation_channel.toLowerCase())) {
    return { row: null, error: "Unsupported lead creation channel." };
  }
  row.lead_creation_channel = row.lead_creation_channel.toLowerCase() || "other";
  row.first_touch_source ||= "CSV Import";
  return { row, error: null };
}

export function importIdentityKeys(row: Pick<ImportLeadRow, "email" | "phone">): string[] {
  const email = row.email.trim().toLowerCase();
  const phone = row.phone.replace(/[^+\d]/g, "");
  return [...(email ? ["email:" + email] : []), ...(phone ? ["phone:" + phone] : [])];
}

export type ImportCsvPreview = {
  rows: ImportLeadRow[];
  issues: { rowNumber: number; message: string }[];
};

export function parseLeadsImportCsv(text: string): ImportCsvPreview {
  if (new TextEncoder().encode(text).length > MAX_LEADS_IMPORT_BYTES) {
    throw new Error("CSV must be smaller than 1 MB.");
  }
  const matrix = parseMatrix(text);
  if (matrix.length < 2) throw new Error("CSV must contain a header and at least one lead.");
  const headers = matrix[0].map(v => v.trim().toLowerCase());
  if (new Set(headers).size !== headers.length) throw new Error("Duplicate CSV headers are not allowed.");
  const unexpected = headers.filter(h => !(LEADS_IMPORT_COLUMNS as readonly string[]).includes(h));
  if (unexpected.length) throw new Error("Unsupported column(s): " + unexpected.join(", ") + ".");
  if (!headers.includes("first_name") || (!headers.includes("email") && !headers.includes("phone"))) {
    throw new Error("CSV needs first_name and at least one of email or phone columns.");
  }
  if (matrix.length - 1 > MAX_LEADS_IMPORT_ROWS) {
    throw new Error("CSV limit is " + MAX_LEADS_IMPORT_ROWS + " leads per upload.");
  }

  const rows: ImportLeadRow[] = [];
  const issues: ImportCsvPreview["issues"] = [];
  const seen = new Set<string>();
  for (let i = 1; i < matrix.length; i++) {
    const values = matrix[i];
    const rowNumber = i + 1;
    if (values.length !== headers.length) {
      issues.push({ rowNumber, message: "Column count differs from the header." });
      continue;
    }
    const object: Record<string, string | number> = { rowNumber };
    headers.forEach((header, index) => { object[header] = values[index]; });
    const result = validateImportRow(object);
    if (!result.row || result.error) {
      issues.push({ rowNumber, message: result.error ?? "Invalid row." });
      continue;
    }
    const keys = importIdentityKeys(result.row);
    if (keys.some(k => seen.has(k))) {
      issues.push({ rowNumber, message: "Duplicate contact within this CSV." });
      continue;
    }
    keys.forEach(k => seen.add(k));
    rows.push(result.row);
  }
  return { rows, issues };
}
