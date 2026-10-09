import { formatStudioDate } from "./api-types";

export type LedSession = { id: string; className: string; instructorId: string; instructorName: string; startAt: string; endAt: string; status: string };
export type InstructorRecord = { id: string; sessionId: string; instructorId: string; instructorName: string; className: string; startAt: string; endAt: string; minutes: number; rewardCents: number | null; participants: number; version: number; attendanceChanged: boolean; confirmedAt: string; updatedAt: string };
export type InstructorReport = { month: string; timeZone: "Europe/Prague"; summary: { instructorId: string; instructorName: string; lessons: number; minutes: number; rewardCents: number; pendingRewards: number }[]; records: InstructorRecord[]; unconfirmedSessions: LedSession[] };
export type Completion = { session: LedSession; record: InstructorRecord | null; rosterToken: string; bookings: { id: string; status: string; priceCents: number; participantKind: string; participantName: string | null; ownerName: string }[] };

export function studioMonth(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit" }).formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}`;
}
export function hours(minutes: number) { return new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 2 }).format(minutes / 60); }
export function reward(cents: number | null) { return cents === null ? "K doplnění" : new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 2 }).format(cents / 100); }
export function studioInput(instant: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export function studioInstant(local: string, original?: string) {
  if (!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new Error("Zkontrolujte datum a čas lekce.");
  if (original && studioInput(original) === local) return new Date(original).toISOString();
  const utc = new Date(`${local}:00Z`).getTime();
  const candidates = [60, 120].map((offset) => new Date(utc - offset * 60_000)).filter((date) => Number.isFinite(date.getTime()) && studioInput(date.toISOString()) === local);
  if (candidates.length !== 1) throw new Error("Tento čas při změně letního času neexistuje nebo je nejednoznačný. Zvolte jiný čas.");
  return candidates[0]!.toISOString();
}
function csvCell(value: string | number) {
  const text = String(value);
  const safe = /^\s*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function instructorRecordsCsv(report: InstructorReport) {
  const rows: (string | number)[][] = [["Provozní výkaz vedení lekcí", report.month], ["Nepotvrzené minulé lekce (nezahrnuté v souhrnu)", report.unconfirmedSessions.length], ["Datum", "Instruktor", "Lekce", "Od", "Do", "Hodiny vedení", "Účastníci", "Odměna Kč", "Kontrola"]];
  for (const item of report.records) rows.push([formatStudioDate(item.startAt, { year: "numeric", month: "2-digit", day: "2-digit" }), item.instructorName, item.className, formatStudioDate(item.startAt, { hour: "2-digit", minute: "2-digit" }), formatStudioDate(item.endAt, { hour: "2-digit", minute: "2-digit" }), hours(item.minutes), item.participants, item.rewardCents === null ? "K doplnění" : (item.rewardCents / 100).toFixed(2).replace(".", ","), item.attendanceChanged ? "Docházka se změnila — zkontrolovat odměnu" : "Potvrzeno"]);
  rows.push([], ["Měsíční souhrn", report.month], ["Instruktor", "Lekce", "Hodiny vedení", "Součet zadaných odměn Kč", "Chybějící odměny"]);
  for (const item of report.summary) rows.push([item.instructorName, item.lessons, hours(item.minutes), (item.rewardCents / 100).toFixed(2).replace(".", ","), item.pendingRewards]);
  rows.push([], ["Minulé lekce k ověření – bez potvrzených hodin a odměn"], ["Datum a plánovaný čas", "Instruktor", "Lekce"]);
  for (const item of report.unconfirmedSessions) rows.push([formatStudioDate(item.startAt, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }), item.instructorName, item.className]);
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}\r\n`;
}
