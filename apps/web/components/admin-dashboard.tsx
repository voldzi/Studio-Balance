"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Image from "next/image";

import { apiRequest, formatStudioDate } from "../lib/api-types";

type Tab = "dashboard" | "schedule" | "classes" | "reviews" | "transformations" | "news" | "clients" | "bookings";
type ClassType = { active: boolean; arrivalLeadMinutes: number; audience: string; benefits: string; defaultEquipment: string; description: string; difficulty: number; durationMinutes: number; heroImageAlt: string; heroImagePath: string; id: string; name: string; practicalNotice: string; seoDescription: string; seoTitle: string; slug: string; sortOrder: number; suitableForBeginners: boolean; tagline: string; whatToBring: string };
type Instructor = { active: boolean; bio: string; displayName: string; id: string; sortOrder: number };
type Session = { arrivalLeadMinutes: number; bookingCount: number; capacity: number; className: string; classTypeId: string; equipment: string; id: string; instructorId: string; instructorName: string; locationAddress: string; locationName: string; priceCents: number; startAt: string; status: string; suitability: string };
type Client = { bookingCount: number; email: string; emailVerified: boolean; firstName: string | null; id: string; lastName: string | null; phone: string | null };
type Booking = { id: string; priceCents: number; session: { className: string; startAt: string }; status: string; user: { email: string; firstName: string | null; lastName: string | null; phone: string | null } };
type Dashboard = { activeBookings: number; clients: number; today: Session[]; nextWeek: Session[] };
type Review = { authorLabel: string; body: string; classTypeId: string | null; consentConfirmed: boolean; featured: boolean; id: string; published: boolean; rating: number | null; reviewedOn: string | null; sortOrder: number; source: string | null };
type Transformation = { afterAssetId: string; afterImage: { height: number; url: string; width: number }; attribution: string; beforeAssetId: string; beforeImage: { height: number; url: string; width: number }; classTypeId: string | null; consentConfirmed: boolean; featured: boolean; id: string; published: boolean; sortOrder: number; story: string; title: string };
type News = { body: string; featured: boolean; id: string; published: boolean; publishedAt: string | null; sortOrder: number; summary: string; title: string };

const tabs: { id: Tab; label: string }[] = [{ id: "dashboard", label: "Přehled" }, { id: "schedule", label: "Rozvrh" }, { id: "classes", label: "Lekce a lektoři" }, { id: "reviews", label: "Recenze" }, { id: "transformations", label: "Proměny" }, { id: "news", label: "Novinky" }, { id: "clients", label: "Klienti" }, { id: "bookings", label: "Rezervace" }];
const bookingLabels: Record<string, string> = { reserved: "Rezervováno", attended: "Účast", no_show: "Neúčast", cancelled_on_time: "Storno včas", cancelled_late: "Pozdní storno", cancelled_by_studio: "Zrušeno studiem" };

export function AdminDashboard({ email }: { email: string }) {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [dashboard, setDashboard] = useState<Dashboard>();
  const [classTypes, setClassTypes] = useState<ClassType[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [transformations, setTransformations] = useState<Transformation[]>([]);
  const [news, setNews] = useState<News[]>([]);
  const [editingClass, setEditingClass] = useState<ClassType | null>(null);
  const [editingReview, setEditingReview] = useState<Review | null>(null);
  const [editingTransformation, setEditingTransformation] = useState<Transformation | null>(null);
  const [editingNews, setEditingNews] = useState<News | null>(null);
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [nextDashboard, nextClasses, nextInstructors, nextSessions, nextClients, nextBookings, nextReviews, nextTransformations, nextNews] = await Promise.all([
        apiRequest<Dashboard>("/api/v1/admin/dashboard"), apiRequest<{ items: ClassType[] }>("/api/v1/admin/class-types"),
        apiRequest<{ items: Instructor[] }>("/api/v1/admin/instructors"), apiRequest<{ items: Session[] }>("/api/v1/admin/sessions"),
        apiRequest<{ items: Client[] }>("/api/v1/admin/users"), apiRequest<{ items: Booking[] }>("/api/v1/admin/bookings"),
        apiRequest<{ items: Review[] }>("/api/v1/admin/content/reviews"),
        apiRequest<{ items: Transformation[] }>("/api/v1/admin/content/transformations"),
        apiRequest<{ items: News[] }>("/api/v1/admin/content/news")
      ]);
      setDashboard(nextDashboard); setClassTypes(nextClasses.items); setInstructors(nextInstructors.items); setSessions(nextSessions.items); setClients(nextClients.items); setBookings(nextBookings.items); setReviews(nextReviews.items); setTransformations(nextTransformations.items); setNews(nextNews.items);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Administraci se nepodařilo načíst."); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function mutate(path: string, init: RequestInit, success: string): Promise<boolean> {
    setBusy(true); setMessage(undefined);
    try { await apiRequest(path, init); setMessage(success); await load(); return true; }
    catch (error) { setMessage(error instanceof Error ? error.message : "Změnu se nepodařilo uložit."); return false; }
    finally { setBusy(false); }
  }

  async function createSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    if (await mutate("/api/v1/admin/sessions", { method: "POST", body: JSON.stringify({ classTypeId: data.get("classTypeId"), instructorId: data.get("instructorId"), startAt: new Date(String(data.get("startAt"))).toISOString(), durationMinutes: Number(data.get("durationMinutes")), arrivalLeadMinutes: Number(data.get("arrivalLeadMinutes")), locationName: data.get("locationName"), locationAddress: data.get("locationAddress"), priceCents: Math.round(Number(data.get("price")) * 100), capacity: Number(data.get("capacity")), equipment: data.get("equipment"), suitability: data.get("suitability") }) }, "Termín byl přidán.")) form.reset();
  }

  async function saveClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const payload = { slug: data.get("slug"), name: data.get("name"), tagline: data.get("tagline"), description: data.get("description"), durationMinutes: Number(data.get("durationMinutes")), arrivalLeadMinutes: Number(data.get("arrivalLeadMinutes")), active: data.get("active") === "on", sortOrder: Number(data.get("sortOrder")), difficulty: Number(data.get("difficulty")), benefits: data.get("benefits"), audience: data.get("audience"), suitableForBeginners: data.get("suitableForBeginners") === "on", defaultEquipment: data.get("defaultEquipment"), whatToBring: data.get("whatToBring"), practicalNotice: data.get("practicalNotice"), heroImagePath: data.get("heroImagePath"), heroImageAlt: data.get("heroImageAlt"), seoTitle: data.get("seoTitle"), seoDescription: data.get("seoDescription") };
    if (await mutate(editingClass ? `/api/v1/admin/class-types/${editingClass.id}` : "/api/v1/admin/class-types", { method: editingClass ? "PATCH" : "POST", body: JSON.stringify(payload) }, editingClass ? "Typ lekce byl upraven." : "Typ lekce byl přidán.")) {
      setEditingClass(null);
      form.reset();
    }
  }

  async function createInstructor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    if (await mutate("/api/v1/admin/instructors", { method: "POST", body: JSON.stringify({ displayName: data.get("displayName"), bio: data.get("bio"), active: true, sortOrder: instructors.length * 10 + 10 }) }, "Instruktor byl přidán.")) form.reset();
  }

  async function saveReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const rating = String(data.get("rating") ?? "");
    const reviewedOn = String(data.get("reviewedOn") ?? "");
    const classTypeId = String(data.get("classTypeId") ?? "");
    const source = String(data.get("source") ?? "").trim();
    const payload = { authorLabel: data.get("authorLabel"), body: data.get("body"), source: source || null, reviewedOn: reviewedOn || null, rating: rating ? Number(rating) : null, classTypeId: classTypeId || null, consentConfirmed: data.get("consentConfirmed") === "on", published: data.get("published") === "on", featured: data.get("featured") === "on", sortOrder: Number(data.get("sortOrder")) };
    if (await mutate(editingReview ? `/api/v1/admin/content/reviews/${editingReview.id}` : "/api/v1/admin/content/reviews", { method: editingReview ? "PATCH" : "POST", body: JSON.stringify(payload) }, editingReview ? "Recenze byla upravena." : "Recenze byla uložena jako nový záznam.")) {
      setEditingReview(null);
      form.reset();
    }
  }

  async function uploadTransformationImage(file: File) {
    return apiRequest<{ height: number; id: string; url: string; width: number }>("/api/v1/admin/media/transformation-image", { method: "POST", headers: { "content-type": file.type }, body: file });
  }

  async function saveTransformation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    setBusy(true); setMessage(undefined);
    try {
      const beforeFile = data.get("beforeImage"); const afterFile = data.get("afterImage");
      const beforeAssetId = beforeFile instanceof File && beforeFile.size ? (await uploadTransformationImage(beforeFile)).id : editingTransformation?.beforeAssetId;
      const afterAssetId = afterFile instanceof File && afterFile.size ? (await uploadTransformationImage(afterFile)).id : editingTransformation?.afterAssetId;
      if (!beforeAssetId || !afterAssetId) throw new Error("Vyberte fotografii před i fotografii po proměně.");
      const classTypeId = String(data.get("classTypeId") ?? "");
      const payload = { title: data.get("title"), story: data.get("story"), attribution: data.get("attribution"), classTypeId: classTypeId || null, beforeAssetId, afterAssetId, consentConfirmed: data.get("consentConfirmed") === "on", published: data.get("published") === "on", featured: data.get("featured") === "on", sortOrder: Number(data.get("sortOrder")) };
      await apiRequest(editingTransformation ? `/api/v1/admin/content/transformations/${editingTransformation.id}` : "/api/v1/admin/content/transformations", { method: editingTransformation ? "PATCH" : "POST", body: JSON.stringify(payload) });
      setMessage(editingTransformation ? "Proměna byla upravena." : "Proměna byla uložena."); setEditingTransformation(null); form.reset(); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Proměnu se nepodařilo uložit."); }
    finally { setBusy(false); }
  }

  async function saveNews(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const published = data.get("published") === "on";
    const publishedAtInput = String(data.get("publishedAt") ?? "");
    const payload = { title: data.get("title"), summary: data.get("summary"), body: data.get("body"), published, featured: data.get("featured") === "on", publishedAt: publishedAtInput ? new Date(publishedAtInput).toISOString() : published ? new Date().toISOString() : null, sortOrder: Number(data.get("sortOrder")) };
    if (await mutate(editingNews ? `/api/v1/admin/content/news/${editingNews.id}` : "/api/v1/admin/content/news", { method: editingNews ? "PATCH" : "POST", body: JSON.stringify(payload) }, editingNews ? "Novinka byla upravena." : "Novinka byla uložena.")) {
      setEditingNews(null); form.reset();
    }
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
    {tab === "schedule" && <><AdminHeading eyebrow="Provoz" title="Rozvrh a termíny" copy="Přidejte jednorázový termín nebo bezpečně zrušte existující." /><details className="admin-create" open><summary>Přidat termín</summary><form className="admin-form admin-form-grid" onSubmit={createSession}><Select label="Typ lekce" name="classTypeId" options={classTypes.map((item) => ({ label: item.name, value: item.id }))} /><Select label="Instruktor" name="instructorId" options={instructors.map((item) => ({ label: item.displayName, value: item.id }))} /><Field help="Zadejte místní datum a čas začátku ve studiu." label="Začátek" name="startAt" type="datetime-local" required /><Field label="Délka (min)" name="durationMinutes" type="number" defaultValue="60" required /><Field help="Maximální počet rezervací. Veřejný web toto číslo návštěvníkům nezobrazuje." label="Kapacita" name="capacity" type="number" defaultValue="10" required /><Field help="Cena jedné návštěvy placená ve studiu. Online platba se nepoužívá." label="Cena (Kč)" name="price" type="number" defaultValue="250" required /><Field label="Doporučený příchod (min)" name="arrivalLeadMinutes" type="number" defaultValue="10" required /><Field label="Místo" name="locationName" defaultValue="Studio Balance" required /><Field label="Adresa" name="locationAddress" defaultValue="Ruská 10, 792 01 Bruntál" required /><Field label="Pomůcky" name="equipment" defaultValue="Pohodlné oblečení, láhev s vodou a ručník." required /><Field label="Vhodnost" name="suitability" defaultValue="Lekci lze přizpůsobit začátečnicím i pokročilým." required /><button className="button" disabled={busy} type="submit">Přidat termín</button></form></details><DataCard title="Naplánované termíny">{sessions.length ? sessions.map((item) => <SessionRow item={item} key={item.id} onCancel={cancelSession} busy={busy} />) : <Empty text="Nejsou vytvořené žádné termíny." />}</DataCard></>}
    {tab === "classes" && <><AdminHeading eyebrow="Nabídka" title="Lekce a instruktoři" copy="Obsah, náročnost a fotografii upravíte zde; veřejný web se aktualizuje z jednoho zdroje." /><div className="admin-two-columns"><DataCard title={editingClass ? `Upravit: ${editingClass.name}` : "Typy lekcí"}><ClassTypeForm item={editingClass} busy={busy} nextSortOrder={classTypes.length * 10 + 10} onCancel={() => setEditingClass(null)} onSubmit={saveClass} /><ul className="admin-simple-list">{classTypes.map((item) => <li key={item.id}><div><strong>{item.name} · {item.difficulty}/5</strong><span>{item.tagline}</span></div><button onClick={() => setEditingClass(item)} type="button">Upravit</button></li>)}</ul></DataCard><DataCard title="Instruktoři"><form className="admin-form" onSubmit={createInstructor}><Field label="Jméno" name="displayName" required /><Field label="Představení" name="bio" required /><button className="button button-small" disabled={busy} type="submit">Přidat instruktora</button></form><ul className="admin-simple-list">{instructors.map((item) => <li key={item.id}><div><strong>{item.displayName}</strong><span>{item.bio}</span></div><span>{item.active ? "Aktivní" : "Skrytý"}</span></li>)}</ul></DataCard></div></>}
    {tab === "reviews" && <><AdminHeading eyebrow="Obsah webu" title="Recenze klientek" copy="Zveřejněte pouze skutečnou referenci s doloženým souhlasem. Hvězdičky jsou volitelné a nejsou náročností lekce." /><div className="admin-two-columns"><DataCard title={editingReview ? `Upravit: ${editingReview.authorLabel}` : "Nová recenze"}><ReviewForm busy={busy} classTypes={classTypes} item={editingReview} key={editingReview?.id ?? "new"} nextSortOrder={reviews.length * 10 + 10} onCancel={() => setEditingReview(null)} onSubmit={saveReview} /></DataCard><DataCard title={`${reviews.length} recenzí`}><ul className="admin-simple-list admin-review-list">{reviews.length ? reviews.map((item) => <li key={item.id}><div><strong>{item.authorLabel}{item.rating ? ` · ${item.rating}/5` : ""}</strong><span>{item.body}</span><span>{item.published ? item.featured ? "Publikováno na titulní stránce" : "Publikováno" : "Koncept / skryto"}</span></div><button onClick={() => setEditingReview(item)} type="button">Upravit</button></li>) : <Empty text="Zatím není vložená žádná skutečná recenze." />}</ul></DataCard></div></>}
    {tab === "transformations" && <><AdminHeading eyebrow="Obsah webu" title="Proměny klientek" copy="Vložte vždy skutečnou dvojici fotografií před a po. Zveřejnění je možné až po doložení výslovného souhlasu klientky." /><div className="admin-two-columns admin-transformations-layout"><DataCard title={editingTransformation ? `Upravit: ${editingTransformation.title}` : "Nová proměna"}><TransformationForm busy={busy} classTypes={classTypes} item={editingTransformation} key={editingTransformation?.id ?? "new"} nextSortOrder={transformations.length * 10 + 10} onCancel={() => setEditingTransformation(null)} onSubmit={saveTransformation} /></DataCard><DataCard title={`${transformations.length} proměn`}><ul className="admin-simple-list admin-transformation-list">{transformations.length ? transformations.map((item) => <li key={item.id}><div><div className="admin-before-after"><figure><Image alt="Před proměnou" height={item.beforeImage.height} src={item.beforeImage.url} unoptimized width={item.beforeImage.width} /><figcaption>Před</figcaption></figure><figure><Image alt="Po proměně" height={item.afterImage.height} src={item.afterImage.url} unoptimized width={item.afterImage.width} /><figcaption>Po</figcaption></figure></div><strong>{item.title} · {item.attribution}</strong><span>{item.published ? item.featured ? "Publikováno na titulní stránce" : "Publikováno" : "Koncept / skryto"}</span></div><button onClick={() => setEditingTransformation(item)} type="button">Upravit</button></li>) : <Empty text="Zatím není vložená žádná proměna. Nahrajte ji až se souhlasem klientky." />}</ul></DataCard></div></>}
    {tab === "news" && <><AdminHeading eyebrow="Klientská aplikace" title="Novinky ze studia" copy="Vytvořte krátké, skutečné sdělení. Publikovaná novinka se objeví klientkám v jejich účtu." /><div className="admin-two-columns"><DataCard title={editingNews ? `Upravit: ${editingNews.title}` : "Nová novinka"}><NewsForm busy={busy} item={editingNews} key={editingNews?.id ?? "new"} nextSortOrder={news.length * 10 + 10} onCancel={() => setEditingNews(null)} onSubmit={saveNews} /></DataCard><DataCard title={`${news.length} novinek`}><ul className="admin-simple-list">{news.length ? news.map((item) => <li key={item.id}><div><strong>{item.title}</strong><span>{item.summary}</span><span>{item.published ? item.featured ? "Publikováno a zvýrazněno" : "Publikováno" : "Koncept / skryto"}</span></div><button onClick={() => setEditingNews(item)} type="button">Upravit</button></li>) : <Empty text="Zatím není vložená žádná novinka." />}</ul></DataCard></div></>}
    {tab === "clients" && <><AdminHeading eyebrow="Klientská evidence" title="Klienti" copy="Kontaktní údaje a přehled rezervací, bez platebních údajů." /><DataCard title={`${clients.length} klientů`}><div className="admin-table-wrap"><table><thead><tr><th>Klient</th><th>E-mail</th><th>Telefon</th><th>Rezervace</th><th>Ověření</th></tr></thead><tbody>{clients.map((item) => <tr key={item.id}><td>{[item.firstName,item.lastName].filter(Boolean).join(" ") || "Nedoplněno"}</td><td>{item.email}</td><td>{item.phone ?? "—"}</td><td>{item.bookingCount}</td><td>{item.emailVerified ? "Ověřeno" : "Neověřeno"}</td></tr>)}</tbody></table></div></DataCard></>}
    {tab === "bookings" && <><AdminHeading eyebrow="Docházka" title="Rezervace" copy="Aktuální stav rezervací a evidence účasti nebo neúčasti." /><DataCard title={`${bookings.length} rezervací`}><div className="admin-table-wrap"><table><thead><tr><th>Lekce</th><th>Klient</th><th>Kontakt</th><th>Stav</th><th>Akce</th></tr></thead><tbody>{bookings.map((item) => <tr key={item.id}><td><strong>{item.session.className}</strong><br />{formatStudioDate(item.session.startAt,{day:"numeric",month:"numeric",year:"numeric",hour:"2-digit",minute:"2-digit"})}</td><td>{[item.user.firstName,item.user.lastName].filter(Boolean).join(" ") || item.user.email}</td><td>{item.user.phone ?? item.user.email}</td><td>{bookingLabels[item.status] ?? item.status}</td><td><div className="admin-row-actions"><button disabled={busy} onClick={() => void attendance(item,"attended")} type="button">Účast</button><button disabled={busy} onClick={() => void attendance(item,"no_show")} type="button">Neúčast</button></div></td></tr>)}</tbody></table></div></DataCard></>}
  </>}</section></main>;
}

function AdminHeading({ eyebrow, title, copy }: { copy: string; eyebrow: string; title: string }) { return <header className="admin-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{copy}</p></header>; }
function Stat({ label, value }: { label: string; value: number }) { return <article className="admin-stat"><span>{label}</span><strong>{value}</strong></article>; }
function DataCard({ children, title }: { children: React.ReactNode; title: string }) { return <section className="admin-card"><h2>{title}</h2>{children}</section>; }
function Empty({ text }: { text: string }) { return <p className="admin-empty">{text}</p>; }
function ClassTypeForm({ busy, item, nextSortOrder, onCancel, onSubmit }: { busy: boolean; item: ClassType | null; nextSortOrder: number; onCancel: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void> }) {
  const value = <K extends keyof ClassType>(key: K, fallback = "") => item ? String(item[key]) : fallback;
  return <form className="admin-form" onSubmit={(event) => void onSubmit(event)}>
    <Field defaultValue={value("name")} label="Název" name="name" required /><Field defaultValue={value("slug")} label="URL slug" name="slug" placeholder="ranni-joga" required /><Field defaultValue={value("tagline")} label="Krátké sdělení" name="tagline" required /><TextArea defaultValue={value("description")} label="Popis lekce" name="description" required />
    <div className="admin-inline"><Field defaultValue={value("durationMinutes", "60")} label="Délka (min)" name="durationMinutes" type="number" required /><Field defaultValue={value("arrivalLeadMinutes", "10")} label="Příchod (min)" name="arrivalLeadMinutes" type="number" required /><Field defaultValue={value("difficulty", "3")} label="Náročnost (1–5)" name="difficulty" type="number" required /><Field defaultValue={value("sortOrder", String(nextSortOrder))} label="Pořadí" name="sortOrder" type="number" required /></div>
    <TextArea defaultValue={value("benefits")} label="Hlavní přínosy" name="benefits" /><TextArea defaultValue={value("audience")} label="Pro koho je lekce" name="audience" /><TextArea defaultValue={value("defaultEquipment")} label="Pomůcky" name="defaultEquipment" /><TextArea defaultValue={value("whatToBring")} label="Co si vzít" name="whatToBring" /><TextArea defaultValue={value("practicalNotice")} label="Praktické upozornění" name="practicalNotice" />
    <Field defaultValue={value("heroImagePath")} label="Cesta k fotografii" name="heroImagePath" placeholder="/images/studio-balance/..." /><Field defaultValue={value("heroImageAlt")} label="Alternativní text fotografie" name="heroImageAlt" /><Field defaultValue={value("seoTitle")} label="SEO title" name="seoTitle" /><TextArea defaultValue={value("seoDescription")} label="SEO popis" name="seoDescription" />
    <label className="admin-check"><input defaultChecked={item?.suitableForBeginners ?? true} name="suitableForBeginners" type="checkbox" /> Vhodné pro začátečníky</label><label className="admin-check"><input defaultChecked={item?.active ?? true} name="active" type="checkbox" /> Aktivní na webu</label>
    <div className="admin-row-actions"><button className="button button-small" disabled={busy} type="submit">{item ? "Uložit změny" : "Přidat typ"}</button>{item && <button onClick={onCancel} type="button">Zrušit úpravy</button>}</div>
  </form>;
}
function ReviewForm({ busy, classTypes, item, nextSortOrder, onCancel, onSubmit }: { busy: boolean; classTypes: ClassType[]; item: Review | null; nextSortOrder: number; onCancel: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void> }) {
  return <form className="admin-form" onSubmit={(event) => void onSubmit(event)}>
    <Field defaultValue={item?.authorLabel ?? ""} label="Jméno nebo schválená iniciála" name="authorLabel" required />
    <TextArea defaultValue={item?.body ?? ""} label="Přesné znění recenze" name="body" required />
    <Field defaultValue={item?.source ?? ""} help="Uveďte například WhatsApp nebo osobní zpráva. Pole můžete nechat prázdné." label="Zdroj recenze (volitelné, zobrazí se veřejně)" name="source" placeholder="Např. WhatsApp" />
    <div className="admin-inline"><Field defaultValue={item?.reviewedOn ?? ""} label="Datum recenze (volitelné)" name="reviewedOn" type="date" /><label>Skutečné hodnocení (volitelné)<select defaultValue={item?.rating ?? ""} name="rating"><option value="">Bez hvězdiček</option>{[1,2,3,4,5].map((value) => <option key={value} value={value}>{value} z 5</option>)}</select></label></div>
    <label>Vztah k lekci (volitelné)<select defaultValue={item?.classTypeId ?? ""} name="classTypeId"><option value="">Obecná zkušenost se studiem</option>{classTypes.filter((classType) => classType.active || classType.id === item?.classTypeId).map((classType) => <option key={classType.id} value={classType.id}>{classType.name}{classType.active ? "" : " (skrytá lekce)"}</option>)}</select></label>
    <Field defaultValue={String(item?.sortOrder ?? nextSortOrder)} help="Nižší číslo se zobrazí dříve. Pro běžné řazení používejte 10, 20, 30…" label="Pořadí" name="sortOrder" type="number" required />
    <Check help="Zaškrtněte jen tehdy, když máte prokazatelný souhlas autorky se zveřejněním textu a jména." label="Souhlas s publikací je doložený" name="consentConfirmed" checked={item?.consentConfirmed ?? false} />
    <Check help="Položka se po uložení objeví na veřejném webu. Bez souhlasu ji systém nezveřejní." label="Publikovat na webu" name="published" checked={item?.published ?? false} />
    <Check help="Zvýrazněná recenze se zobrazí také na úvodní stránce." label="Zvýraznit také na titulní stránce" name="featured" checked={item?.featured ?? false} />
    <p className="admin-form-note">Bez doloženého souhlasu nelze recenzi publikovat. Text se zobrazí jako prostý text bez vloženého HTML.</p>
    <div className="admin-row-actions"><button className="button button-small" disabled={busy} type="submit">{item ? "Uložit změny" : "Uložit recenzi"}</button>{item && <button onClick={onCancel} type="button">Zrušit úpravy</button>}</div>
  </form>;
}
function NewsForm({ busy, item, nextSortOrder, onCancel, onSubmit }: { busy: boolean; item: News | null; nextSortOrder: number; onCancel: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void> }) {
  const localPublishedAt = item?.publishedAt ? new Date(new Date(item.publishedAt).getTime() - new Date(item.publishedAt).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "";
  return <form className="admin-form" onSubmit={(event) => void onSubmit(event)}>
    <Field defaultValue={item?.title ?? ""} help="Krátký a konkrétní nadpis, například Nová ranní lekce Barre Strength." label="Nadpis" name="title" required />
    <TextArea defaultValue={item?.summary ?? ""} help="Jedna až dvě věty, které klientka uvidí v přehledu." label="Krátké shrnutí" name="summary" required />
    <TextArea defaultValue={item?.body ?? ""} help="Úplná informace bez vloženého HTML. Můžete použít odstavce." label="Text novinky" name="body" required />
    <div className="admin-inline"><Field defaultValue={localPublishedAt} help="Čas, od kterého se novinka zobrazí. U konceptu může zůstat prázdný." label="Datum zveřejnění" name="publishedAt" type="datetime-local" /><Field defaultValue={String(item?.sortOrder ?? nextSortOrder)} help="Nižší číslo se zobrazí dříve." label="Pořadí" name="sortOrder" type="number" required /></div>
    <Check checked={item?.published ?? false} help="Po uložení se novinka zobrazí přihlášeným klientkám, nejdříve v nastavený čas." label="Publikovat v klientské aplikaci" name="published" />
    <Check checked={item?.featured ?? false} help="Zvýrazněná novinka se v seznamu zobrazí jako první. Musí být publikovaná." label="Zvýraznit" name="featured" />
    <div className="admin-row-actions"><button className="button button-small" disabled={busy} type="submit">{item ? "Uložit změny" : "Uložit novinku"}</button>{item && <button onClick={onCancel} type="button">Zrušit úpravy</button>}</div>
  </form>;
}
function TransformationForm({ busy, classTypes, item, nextSortOrder, onCancel, onSubmit }: { busy: boolean; classTypes: ClassType[]; item: Transformation | null; nextSortOrder: number; onCancel: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void> }) {
  return <form className="admin-form" onSubmit={(event) => void onSubmit(event)}>
    <Field defaultValue={item?.title ?? ""} help="Krátký nadpis bez zdravotních slibů, například Proměna díky pravidelnému Jumpingu." label="Nadpis proměny" name="title" required />
    <TextArea defaultValue={item?.story ?? ""} help="Popište pravdivou zkušenost klientky. Neuvádějte diagnózy, hmotnost ani jiné citlivé údaje bez zvláštního důvodu a souhlasu." label="Příběh klientky" name="story" required />
    <Field defaultValue={item?.attribution ?? ""} help="Použijte celé jméno pouze se souhlasem; jinak schválenou iniciálu nebo křestní jméno." label="Jméno nebo schválená iniciála" name="attribution" required />
    <label><span className="admin-label-row">Vztah k lekci (volitelné)<HelpHint text="Vybraná lekce umožní návštěvnici přejít přímo na její detail." /></span><select defaultValue={item?.classTypeId ?? ""} name="classTypeId"><option value="">Obecná proměna</option>{classTypes.filter((classType) => classType.active || classType.id === item?.classTypeId).map((classType) => <option key={classType.id} value={classType.id}>{classType.name}</option>)}</select></label>
    <div className="admin-upload-grid"><ImageUpload current={item?.beforeImage.url} help="Nahrajte původní fotografii bez filtrů a bez viditelných osob, které se zveřejněním nesouhlasily." label="Fotografie před" name="beforeImage" required={!item} /><ImageUpload current={item?.afterImage.url} help="Použijte srovnatelný záběr. Neupravujte proporce postavy ani nevytvářejte zavádějící výsledek." label="Fotografie po" name="afterImage" required={!item} /></div>
    <Field defaultValue={String(item?.sortOrder ?? nextSortOrder)} help="Nižší číslo se zobrazí dříve. Doporučené hodnoty jsou 10, 20, 30…" label="Pořadí" name="sortOrder" type="number" required />
    <Check checked={item?.consentConfirmed ?? false} help="Musíte mít uložený výslovný souhlas se zveřejněním obou fotografií, textu a uvedeného jména. Souhlas uchovejte mimo web." label="Souhlas s publikací je doložený" name="consentConfirmed" />
    <Check checked={item?.published ?? false} help="Po uložení bude proměna viditelná na veřejném webu. Bez doloženého souhlasu ji systém odmítne zveřejnit." label="Publikovat na webu" name="published" />
    <Check checked={item?.featured ?? false} help="Zvýrazněná proměna se zobrazí také na titulní stránce. Musí být současně publikovaná." label="Zvýraznit také na titulní stránce" name="featured" />
    <p className="admin-form-note">Fotografie se automaticky zmenší, převedou na WebP a zbaví technických metadat. Skrytí provedete odškrtnutím „Publikovat na webu“.</p>
    <div className="admin-row-actions"><button className="button button-small" disabled={busy} type="submit">{item ? "Uložit změny" : "Uložit proměnu"}</button>{item && <button onClick={onCancel} type="button">Zrušit úpravy</button>}</div>
  </form>;
}
function SessionRow({ item, onCancel, busy }: { busy: boolean; item: Session; onCancel: (item: Session) => Promise<void> }) { return <article className="admin-session-row"><time>{formatStudioDate(item.startAt,{weekday:"short",day:"numeric",month:"numeric",hour:"2-digit",minute:"2-digit"})}</time><div><strong>{item.className}</strong><span>{item.instructorName} · {item.locationName}</span></div><span>{item.bookingCount} / {item.capacity} rezervací</span><span>{item.status === "scheduled" ? "Naplánováno" : "Zrušeno"}</span>{item.status === "scheduled" && <button disabled={busy} onClick={() => void onCancel(item)} type="button">Zrušit</button>}</article>; }
function HelpHint({ text }: { text: string }) { return <span className="admin-help"><button aria-label={`Nápověda: ${text}`} type="button">?</button><span role="tooltip">{text}</span></span>; }
function Label({ help, text }: { help: string | undefined; text: string }) { return <span className="admin-label-row">{text}{help && <HelpHint text={help} />}</span>; }
function Field(props: { defaultValue?: string; help?: string; label: string; name: string; placeholder?: string; required?: boolean; type?: string }) { return <label><Label help={props.help} text={props.label} /><input defaultValue={props.defaultValue} name={props.name} placeholder={props.placeholder} required={props.required} type={props.type ?? "text"} /></label>; }
function TextArea(props: { defaultValue?: string; help?: string; label: string; name: string; required?: boolean }) { return <label><Label help={props.help} text={props.label} /><textarea defaultValue={props.defaultValue} name={props.name} required={props.required} rows={3} /></label>; }
function Select({ help, label, name, options }: { help?: string; label: string; name: string; options: { label: string; value: string }[] }) { return <label><Label help={help} text={label} /><select name={name} required>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>; }
function Check({ checked, help, label, name }: { checked: boolean; help: string; label: string; name: string }) { return <label className="admin-check"><input defaultChecked={checked} name={name} type="checkbox" /><span>{label}</span><HelpHint text={help} /></label>; }
function ImageUpload({ current, help, label, name, required }: { current: string | undefined; help: string; label: string; name: string; required: boolean }) { return <label className="admin-image-upload"><Label help={help} text={label} />{current && <Image alt={`Aktuální ${label.toLocaleLowerCase("cs-CZ")}`} height={480} src={current} unoptimized width={640} />}<input accept="image/jpeg,image/png,image/webp" name={name} required={required} type="file" /><small>JPG, PNG nebo WebP · nejvýše 8 MB</small></label>; }
