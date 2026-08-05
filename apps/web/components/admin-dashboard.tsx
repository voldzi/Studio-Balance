"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { apiRequest, formatStudioDate } from "../lib/api-types";

type Tab = "dashboard" | "schedule" | "classes" | "clients" | "bookings";
type ClassType = { active: boolean; arrivalLeadMinutes: number; description: string; durationMinutes: number; id: string; name: string; slug: string; sortOrder: number; tagline: string };
type Instructor = { active: boolean; bio: string; displayName: string; id: string; sortOrder: number };
type Session = { arrivalLeadMinutes: number; bookingCount: number; capacity: number; className: string; classTypeId: string; equipment: string; id: string; instructorId: string; instructorName: string; locationAddress: string; locationName: string; priceCents: number; startAt: string; status: string; suitability: string };
type Client = { bookingCount: number; email: string; emailVerified: boolean; firstName: string | null; id: string; lastName: string | null; phone: string | null };
type Booking = { id: string; priceCents: number; session: { className: string; startAt: string }; status: string; user: { email: string; firstName: string | null; lastName: string | null; phone: string | null } };
type Dashboard = { activeBookings: number; clients: number; today: Session[]; nextWeek: Session[] };

const tabs: { id: Tab; label: string }[] = [{ id: "dashboard", label: "Přehled" }, { id: "schedule", label: "Rozvrh" }, { id: "classes", label: "Lekce a lektoři" }, { id: "clients", label: "Klienti" }, { id: "bookings", label: "Rezervace" }];
const bookingLabels: Record<string, string> = { reserved: "Rezervováno", attended: "Účast", no_show: "Neúčast", cancelled_on_time: "Storno včas", cancelled_late: "Pozdní storno", cancelled_by_studio: "Zrušeno studiem" };

export function AdminDashboard({ email }: { email: string }) {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [dashboard, setDashboard] = useState<Dashboard>();
  const [classTypes, setClassTypes] = useState<ClassType[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [nextDashboard, nextClasses, nextInstructors, nextSessions, nextClients, nextBookings] = await Promise.all([
        apiRequest<Dashboard>("/api/v1/admin/dashboard"), apiRequest<{ items: ClassType[] }>("/api/v1/admin/class-types"),
        apiRequest<{ items: Instructor[] }>("/api/v1/admin/instructors"), apiRequest<{ items: Session[] }>("/api/v1/admin/sessions"),
        apiRequest<{ items: Client[] }>("/api/v1/admin/users"), apiRequest<{ items: Booking[] }>("/api/v1/admin/bookings")
      ]);
      setDashboard(nextDashboard); setClassTypes(nextClasses.items); setInstructors(nextInstructors.items); setSessions(nextSessions.items); setClients(nextClients.items); setBookings(nextBookings.items);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Administraci se nepodařilo načíst."); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function mutate(path: string, init: RequestInit, success: string) {
    setBusy(true); setMessage(undefined);
    try { await apiRequest(path, init); setMessage(success); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Změnu se nepodařilo uložit."); }
    finally { setBusy(false); }
  }

  async function createSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    await mutate("/api/v1/admin/sessions", { method: "POST", body: JSON.stringify({ classTypeId: data.get("classTypeId"), instructorId: data.get("instructorId"), startAt: new Date(String(data.get("startAt"))).toISOString(), durationMinutes: Number(data.get("durationMinutes")), arrivalLeadMinutes: Number(data.get("arrivalLeadMinutes")), locationName: data.get("locationName"), locationAddress: data.get("locationAddress"), priceCents: Math.round(Number(data.get("price")) * 100), capacity: Number(data.get("capacity")), equipment: data.get("equipment"), suitability: data.get("suitability") }) }, "Termín byl přidán.");
    event.currentTarget.reset();
  }

  async function createClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    await mutate("/api/v1/admin/class-types", { method: "POST", body: JSON.stringify({ slug: data.get("slug"), name: data.get("name"), tagline: data.get("tagline"), description: data.get("description"), durationMinutes: Number(data.get("durationMinutes")), arrivalLeadMinutes: Number(data.get("arrivalLeadMinutes")), active: true, sortOrder: classTypes.length * 10 + 10 }) }, "Typ lekce byl přidán.");
    event.currentTarget.reset();
  }

  async function createInstructor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    await mutate("/api/v1/admin/instructors", { method: "POST", body: JSON.stringify({ displayName: data.get("displayName"), bio: data.get("bio"), active: true, sortOrder: instructors.length * 10 + 10 }) }, "Instruktor byl přidán.");
    event.currentTarget.reset();
  }

  async function cancelSession(item: Session) {
    const reason = window.prompt(`Důvod zrušení termínu ${item.className}:`);
    if (!reason) return;
    if (!window.confirm("Termín se zruší všem rezervovaným klientům bez storno poplatku. Pokračovat?")) return;
    await mutate(`/api/v1/admin/sessions/${item.id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }, "Termín byl zrušen a klientům vznikla zpráva v účtu.");
  }

  async function attendance(booking: Booking, status: "attended" | "no_show") {
    const reason = window.prompt(status === "attended" ? "Poznámka k potvrzení účasti:" : "Důvod evidence neúčasti:");
    if (!reason) return;
    await mutate(`/api/v1/admin/bookings/${booking.id}/attendance`, { method: "POST", body: JSON.stringify({ status, reason }) }, status === "attended" ? "Účast byla potvrzena." : "Neúčast byla zaznamenána a vznikl poplatek ve studiu.");
  }

  return <main className="admin-app"><aside className="admin-sidebar"><div><p className="admin-brand">Studio Balance</p><p className="admin-caption">Administrace</p></div><nav aria-label="Administrace">{tabs.map((item) => <button aria-current={tab === item.id ? "page" : undefined} className={tab === item.id ? "active" : ""} key={item.id} onClick={() => setTab(item.id)} type="button">{item.label}</button>)}</nav><div className="admin-user"><span>{email}</span><form action="/admin/auth/logout" method="post"><button type="submit">Odhlásit se</button></form></div></aside><section className="admin-content">{message && <p className="admin-message" role="status">{message}</p>}{!dashboard ? <p role="status">Načítáme administraci…</p> : <>
    {tab === "dashboard" && <><AdminHeading eyebrow="Dnešní provoz" title="Přehled studia" copy="To podstatné pro dnešek a nejbližší týden." /><div className="admin-stats"><Stat label="Dnešní lekce" value={dashboard.today.length} /><Stat label="Aktivní rezervace" value={dashboard.activeBookings} /><Stat label="Klienti" value={dashboard.clients} /></div><DataCard title="Dnešní lekce">{dashboard.today.length ? dashboard.today.map((item) => <SessionRow item={item} key={item.id} onCancel={cancelSession} busy={busy} />) : <Empty text="Dnes není naplánovaná žádná lekce." />}</DataCard></>}
    {tab === "schedule" && <><AdminHeading eyebrow="Provoz" title="Rozvrh a termíny" copy="Přidejte jednorázový termín nebo bezpečně zrušte existující." /><details className="admin-create" open><summary>Přidat termín</summary><form className="admin-form admin-form-grid" onSubmit={createSession}><Select label="Typ lekce" name="classTypeId" options={classTypes.map((item) => ({ label: item.name, value: item.id }))} /><Select label="Instruktor" name="instructorId" options={instructors.map((item) => ({ label: item.displayName, value: item.id }))} /><Field label="Začátek" name="startAt" type="datetime-local" required /><Field label="Délka (min)" name="durationMinutes" type="number" defaultValue="60" required /><Field label="Kapacita" name="capacity" type="number" defaultValue="10" required /><Field label="Cena (Kč)" name="price" type="number" defaultValue="250" required /><Field label="Doporučený příchod (min)" name="arrivalLeadMinutes" type="number" defaultValue="10" required /><Field label="Místo" name="locationName" defaultValue="Studio Balance" required /><Field label="Adresa" name="locationAddress" defaultValue="Ruská 10, 792 01 Bruntál" required /><Field label="Pomůcky" name="equipment" defaultValue="Pohodlné oblečení, láhev s vodou a ručník." required /><Field label="Vhodnost" name="suitability" defaultValue="Lekci lze přizpůsobit začátečnicím i pokročilým." required /><button className="button" disabled={busy} type="submit">Přidat termín</button></form></details><DataCard title="Naplánované termíny">{sessions.length ? sessions.map((item) => <SessionRow item={item} key={item.id} onCancel={cancelSession} busy={busy} />) : <Empty text="Nejsou vytvořené žádné termíny." />}</DataCard></>}
    {tab === "classes" && <><AdminHeading eyebrow="Nabídka" title="Lekce a instruktoři" copy="Základní katalog, ze kterého vzniká veřejný rozvrh." /><div className="admin-two-columns"><DataCard title="Typy lekcí"><form className="admin-form" onSubmit={createClass}><Field label="Název" name="name" required /><Field label="URL slug" name="slug" placeholder="ranni-joga" required /><Field label="Krátké sdělení" name="tagline" required /><Field label="Popis" name="description" required /><div className="admin-inline"><Field label="Délka" name="durationMinutes" type="number" defaultValue="60" required /><Field label="Příchod" name="arrivalLeadMinutes" type="number" defaultValue="10" required /></div><button className="button button-small" disabled={busy} type="submit">Přidat typ</button></form><ul className="admin-simple-list">{classTypes.map((item) => <li key={item.id}><div><strong>{item.name}</strong><span>{item.tagline}</span></div><span>{item.active ? "Aktivní" : "Skrytá"}</span></li>)}</ul></DataCard><DataCard title="Instruktoři"><form className="admin-form" onSubmit={createInstructor}><Field label="Jméno" name="displayName" required /><Field label="Představení" name="bio" required /><button className="button button-small" disabled={busy} type="submit">Přidat instruktora</button></form><ul className="admin-simple-list">{instructors.map((item) => <li key={item.id}><div><strong>{item.displayName}</strong><span>{item.bio}</span></div><span>{item.active ? "Aktivní" : "Skrytý"}</span></li>)}</ul></DataCard></div></>}
    {tab === "clients" && <><AdminHeading eyebrow="Klientská evidence" title="Klienti" copy="Kontaktní údaje a přehled rezervací, bez platebních údajů." /><DataCard title={`${clients.length} klientů`}><div className="admin-table-wrap"><table><thead><tr><th>Klient</th><th>E-mail</th><th>Telefon</th><th>Rezervace</th><th>Ověření</th></tr></thead><tbody>{clients.map((item) => <tr key={item.id}><td>{[item.firstName,item.lastName].filter(Boolean).join(" ") || "Nedoplněno"}</td><td>{item.email}</td><td>{item.phone ?? "—"}</td><td>{item.bookingCount}</td><td>{item.emailVerified ? "Ověřeno" : "Neověřeno"}</td></tr>)}</tbody></table></div></DataCard></>}
    {tab === "bookings" && <><AdminHeading eyebrow="Docházka" title="Rezervace" copy="Aktuální stav rezervací a evidence účasti nebo neúčasti." /><DataCard title={`${bookings.length} rezervací`}><div className="admin-table-wrap"><table><thead><tr><th>Lekce</th><th>Klient</th><th>Kontakt</th><th>Stav</th><th>Akce</th></tr></thead><tbody>{bookings.map((item) => <tr key={item.id}><td><strong>{item.session.className}</strong><br />{formatStudioDate(item.session.startAt,{day:"numeric",month:"numeric",year:"numeric",hour:"2-digit",minute:"2-digit"})}</td><td>{[item.user.firstName,item.user.lastName].filter(Boolean).join(" ") || item.user.email}</td><td>{item.user.phone ?? item.user.email}</td><td>{bookingLabels[item.status] ?? item.status}</td><td><div className="admin-row-actions"><button disabled={busy} onClick={() => void attendance(item,"attended")} type="button">Účast</button><button disabled={busy} onClick={() => void attendance(item,"no_show")} type="button">Neúčast</button></div></td></tr>)}</tbody></table></div></DataCard></>}
  </>}</section></main>;
}

function AdminHeading({ eyebrow, title, copy }: { copy: string; eyebrow: string; title: string }) { return <header className="admin-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{copy}</p></header>; }
function Stat({ label, value }: { label: string; value: number }) { return <article className="admin-stat"><span>{label}</span><strong>{value}</strong></article>; }
function DataCard({ children, title }: { children: React.ReactNode; title: string }) { return <section className="admin-card"><h2>{title}</h2>{children}</section>; }
function Empty({ text }: { text: string }) { return <p className="admin-empty">{text}</p>; }
function SessionRow({ item, onCancel, busy }: { busy: boolean; item: Session; onCancel: (item: Session) => Promise<void> }) { return <article className="admin-session-row"><time>{formatStudioDate(item.startAt,{weekday:"short",day:"numeric",month:"numeric",hour:"2-digit",minute:"2-digit"})}</time><div><strong>{item.className}</strong><span>{item.instructorName} · {item.locationName}</span></div><span>{item.bookingCount} / {item.capacity} rezervací</span><span>{item.status === "scheduled" ? "Naplánováno" : "Zrušeno"}</span>{item.status === "scheduled" && <button disabled={busy} onClick={() => void onCancel(item)} type="button">Zrušit</button>}</article>; }
function Field(props: { defaultValue?: string; label: string; name: string; placeholder?: string; required?: boolean; type?: string }) { return <label>{props.label}<input defaultValue={props.defaultValue} name={props.name} placeholder={props.placeholder} required={props.required} type={props.type ?? "text"} /></label>; }
function Select({ label, name, options }: { label: string; name: string; options: { label: string; value: string }[] }) { return <label>{label}<select name={name} required>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>; }
