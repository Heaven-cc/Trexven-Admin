/** Currency precision comes from Intl, never an assumed currency. */
export function currencyDigits(currency: string): number {
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Currency is unavailable");
  const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits;
  if (digits === undefined) throw new Error("Currency precision is unavailable");
  return digits;
}

/** Parse decimal input exactly before converting integer minor units to Number. */
export function parseMoneyInput(value: string, currency: string): number | null {
  const digits = currencyDigits(currency);
  if (value.length > 32) return null;
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match || (match[2]?.length ?? 0) > digits) return null;
  const integer = BigInt(match[1] + (match[2] ?? "").padEnd(digits, "0"));
  return integer <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(integer) : null;
}

export function moneyInputFromMinor(minor: number, currency: string): string {
  if (!Number.isSafeInteger(minor) || minor < 0) return "";
  const digits = currencyDigits(currency);
  const text = String(minor).padStart(digits + 1, "0");
  return digits === 0 ? text : `${text.slice(0, -digits)}.${text.slice(-digits)}`;
}

export function minorToMajor(minor: number, currency: string): number {
  return minor / 10 ** currencyDigits(currency);
}

export function formatMoney(minor: number | null | undefined, currency: string, compact = false): string {
  if (minor == null || !Number.isFinite(minor) || !/^[A-Z]{3}$/.test(currency)) return "Unavailable";
  const exponent = currencyDigits(currency);
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    notation: compact ? "compact" : "standard",
    minimumFractionDigits: 0,
    maximumFractionDigits: compact ? 1 : minor % 10 ** exponent === 0 ? 0 : exponent,
  }).format(minorToMajor(minor, currency));
}

export function formatNumber(value: number | null | undefined, compact = false): string {
  if (value == null || !Number.isFinite(value)) return "Unavailable";
  return new Intl.NumberFormat("en", {
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 0,
  }).format(value);
}

export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function formatDelta(percent: number | null | undefined): string {
  if (percent === null || percent === undefined || !Number.isFinite(percent)) return "—";
  return `${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatDate(d: string | Date | null): string {
  if (!d) return "Unavailable";
  const date = typeof d === "string" ? new Date(d) : d;
  if (!Number.isFinite(date.getTime())) return "Unavailable";
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function formatDateTime(d: string | Date | null): string {
  if (!d) return "Unavailable";
  const date = typeof d === "string" ? new Date(d) : d;
  if (!Number.isFinite(date.getTime())) return "Unavailable";
  return `${formatDate(date)} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

export function formatRelative(d: string | Date | null, now = new Date()): string {
  if (!d) return "Unavailable";
  const date = typeof d === "string" ? new Date(d) : d;
  if (!Number.isFinite(date.getTime())) return "Unavailable";
  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (seconds < 90) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} d ago`;
  return formatDate(date);
}

export function shortId(id: string): string {
  return id.length <= 10 ? id : `${id.slice(0, 8)}…`;
}

export function humanize(key: string): string {
  return key
    .replace(/[._]/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
