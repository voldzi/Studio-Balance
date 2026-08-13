"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  PiArrowRight, PiCalendarBlank, PiCalendarCheck, PiChatCircleText, PiCheckCircle,
  PiClock, PiEnvelopeSimple, PiGear, PiHeart, PiHeartFill, PiHouse, PiMapPin,
  PiNewspaperClipping, PiSignOut, PiUser, PiUserCircle
} from "react-icons/pi";

import {
  ApiError, apiRequest, formatPrice, formatStudioDate, type AccountNotification,
  type Booking, type CancellationPreview, type ClassType, type FavoriteClassType,
  type NewsItem, type Profile
} from "../lib/api-types";

type AccountView = "favorites" | "home" | "messages" | "news" | "profile" | "reservations";
type ReservationPeriod = "history" | "upcoming";

const bookingLabels: Record<Booking["status"], string> = {
  attended: "Absolvováno",
  cancelled_by_studio: "Zrušeno studiem",
  cancelled_late: "Pozdní storno",
  cancelled_on_time: "Zrušeno včas",
  no_show: "Neúčast",
  reserved: "Rezervováno"
};

const validViews = new Set<AccountView>(["favorites", "home", "messages", "news", "profile", "reservations"]);

export function AccountDashboard() {
  const [profile, setProfile] = useState<Profile>();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [notifications, setNotifications] = useState<AccountNotification[]>([]);
  const [classTypes, setClassTypes] = useState<ClassType[]>([]);
  const [favorites, setFavorites] = useState<FavoriteClassType[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [view, setView] = useState<AccountView>("home");
  const [period, setPeriod] = useState<ReservationPeriod>("upcoming");
  const [selected, setSelected] = useState<{ booking: Booking; preview: CancellationPreview }>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setMessage(undefined);
    try {
      // The profile row is created lazily from the verified identity. Ensure it
      // exists before requests that reference it through foreign keys.
      const nextProfile = await apiRequest<Profile>("/api/v1/me");
      const [nextBookings, nextNotifications, nextClasses, nextFavorites, nextNews] = await Promise.all([
        apiRequest<{ items: Booking[] }>("/api/v1/me/bookings"),
        apiRequest<{ items: AccountNotification[] }>("/api/v1/me/notifications"),
        apiRequest<{ items: ClassType[] }>("/api/v1/class-types"),
        apiRequest<{ items: FavoriteClassType[] }>("/api/v1/me/favorites"),
        apiRequest<{ items: NewsItem[] }>("/api/v1/news")
      ]);
      setProfile(nextProfile);
      setBookings(nextBookings.items);
      setNotifications(nextNotifications.items);
      setClassTypes(nextClasses.items);
      setFavorites(nextFavorites.items);
      setNews(nextNews.items);
      setMessage(undefined);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Účet se nepodařilo načíst.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("view") as AccountView | null;
    if (requested && validViews.has(requested)) setView(requested);
  }, []);

  const upcoming = useMemo(() => bookings
    .filter((booking) => booking.status === "reserved" && new Date(booking.session.startAt) > new Date())
    .sort((left, right) => Date.parse(left.session.startAt) - Date.parse(right.session.startAt)), [bookings]);
  const history = useMemo(() => bookings
    .filter((booking) => !upcoming.includes(booking))
    .sort((left, right) => Date.parse(right.session.startAt) - Date.parse(left.session.startAt)), [bookings, upcoming]);
  const classTypeBySlug = useMemo(() => new Map(classTypes.map((item) => [item.slug, item])), [classTypes]);
  const favoriteIds = useMemo(() => new Set(favorites.map((item) => item.id)), [favorites]);

  function navigate(nextView: AccountView) {
    setView(nextView);
    const nextUrl = nextView === "home" ? "/muj-ucet" : `/muj-ucet?view=${nextView}`;
    window.history.replaceState({}, "", nextUrl);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(undefined);
    const data = new FormData(event.currentTarget);
    try {
      const updated = await apiRequest<Profile>("/api/v1/me", {
        method: "PATCH",
        body: JSON.stringify({ firstName: data.get("firstName"), lastName: data.get("lastName"), phone: data.get("phone") })
      });
      setProfile(updated);
      setMessage("Profil je uložený.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Profil se nepodařilo uložit.");
    } finally { setBusy(false); }
  }

  async function toggleFavorite(classType: ClassType) {
    setBusy(true); setMessage(undefined);
    const removing = favoriteIds.has(classType.id);
    try {
      await apiRequest(`/api/v1/me/favorites/${classType.id}`, { method: removing ? "DELETE" : "POST" });
      const response = await apiRequest<{ items: FavoriteClassType[] }>("/api/v1/me/favorites");
      setFavorites(response.items);
      setMessage(removing ? "Lekce byla odebrána z oblíbených." : "Lekce byla přidána do oblíbených.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Oblíbenou lekci se nepodařilo uložit.");
    } finally { setBusy(false); }
  }

  async function openCancellation(booking: Booking) {
    setBusy(true); setMessage(undefined);
    try {
      const preview = await apiRequest<CancellationPreview>(`/api/v1/me/bookings/${booking.id}/cancellation-preview`);
      setSelected({ booking, preview });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Storno se nepodařilo připravit.");
    } finally { setBusy(false); }
  }

  async function confirmCancellation() {
    if (!selected) return;
    setBusy(true);
    try {
      await apiRequest<Booking>(`/api/v1/me/bookings/${selected.booking.id}/cancel`, {
        method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ lateCancellationConfirmed: selected.preview.mode === "late" })
      });
      setSelected(undefined); setMessage("Rezervace byla zrušena."); await load();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Rezervaci se nepodařilo zrušit.");
    } finally { setBusy(false); }
  }

  if (!profile && !message) return <p className="client-app-loading" role="status">Načítáme váš účet…</p>;
  if (!profile) return <p className="client-app-loading" role="alert">{message}</p>;

  const firstName = profile.firstName || "";
  const nextBooking = upcoming[0];
  const nextClass = nextBooking ? classTypeBySlug.get(nextBooking.session.classType.slug) : undefined;

  return (
    <div className="client-app">
      <header className="client-app-header">
        <button aria-label="Domů" className="client-logo-button" onClick={() => navigate("home")} type="button">
          <Image alt="Studio Balance" height={150} priority src="/images/studio-balance/brand-logo.jpg" width={220} />
        </button>
        <div className="client-header-actions">
          <button aria-label="Zprávy účtu" onClick={() => navigate("messages")} type="button"><PiChatCircleText aria-hidden="true" />{notifications.length > 0 && <span>{notifications.length}</span>}</button>
          <button aria-label="Profil" onClick={() => navigate("profile")} type="button"><PiUserCircle aria-hidden="true" /></button>
        </div>
      </header>

      <main className="client-app-main">
        {view === "home" && <HomeView classType={nextClass} firstName={firstName} nextBooking={nextBooking} upcoming={upcoming} busy={busy} navigate={navigate} openCancellation={openCancellation} />}
        {view === "reservations" && <ReservationsView busy={busy} history={history} openCancellation={openCancellation} period={period} setPeriod={setPeriod} upcoming={upcoming} />}
        {view === "favorites" && <FavoritesView busy={busy} classTypes={classTypes} favoriteIds={favoriteIds} toggleFavorite={toggleFavorite} />}
        {view === "news" && <NewsView items={news} />}
        {view === "messages" && <MessagesView items={notifications} />}
        {view === "profile" && <ProfileView busy={busy} profile={profile} saveProfile={saveProfile} />}
        {message && <p className="client-app-message" role="status">{message}</p>}
      </main>

      <ClientBottomNavigation active={view} navigate={navigate} />

      {selected && (
        <div className="modal-backdrop" role="presentation">
          <section aria-labelledby="cancel-title" aria-modal="true" className="cancel-dialog" role="dialog">
            <p className="eyebrow">Storno rezervace</p>
            <h2 id="cancel-title">Opravdu zrušit {selected.booking.session.classType.name}?</h2>
            {selected.preview.mode === "late"
              ? <p>Při pozdním zrušení vznikne poplatek {formatPrice(selected.preview.fee!)}. Uhradíte ho ve studiu, nikoli online.</p>
              : <p>Rezervaci rušíte včas. Místo se uvolní bez storno poplatku.</p>}
            <div className="actions">
              <button className="button" disabled={busy} onClick={() => void confirmCancellation()} type="button">Potvrdit zrušení</button>
              <button className="button button-secondary" disabled={busy} onClick={() => setSelected(undefined)} type="button">Ponechat rezervaci</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function HomeView({ busy, classType, firstName, navigate, nextBooking, openCancellation, upcoming }: { busy: boolean; classType: ClassType | undefined; firstName: string; navigate: (view: AccountView) => void; nextBooking: Booking | undefined; openCancellation: (booking: Booking) => Promise<void>; upcoming: Booking[] }) {
  return <>
    <h1 className="client-greeting">{greeting()}{firstName ? `, ${vocative(firstName)}` : ""}</h1>
    <section aria-labelledby="next-lesson-title" className="next-lesson-card">
      <h2 id="next-lesson-title">Další lekce</h2>
      {nextBooking ? <div className="next-lesson-layout">
        {classType?.heroImage && <div className="next-lesson-image"><Image alt={classType.heroImage.alt} fill priority sizes="(max-width: 760px) 48vw, 32rem" src={classType.heroImage.src} /></div>}
        <div className="next-lesson-copy">
          <h3>{nextBooking.session.classType.name}</h3>
          <p><PiCalendarBlank aria-hidden="true" />{formatStudioDate(nextBooking.session.startAt, { weekday: "long", day: "numeric", month: "numeric", year: "numeric" })}</p>
          <p><PiClock aria-hidden="true" />{lessonTime(nextBooking)}</p>
          <p><PiUser aria-hidden="true" />{nextBooking.session.instructor.displayName}</p>
          <p><PiMapPin aria-hidden="true" />{nextBooking.session.location.name}</p>
          <span className="reserved-pill"><PiCheckCircle aria-hidden="true" /> Rezervováno</span>
          <Link className="client-primary-action" href={`/rozvrh/${nextBooking.session.id}`}>Detail rezervace <PiArrowRight aria-hidden="true" /></Link>
        </div>
      </div> : <div className="client-empty-state"><p>Teď nemáte žádnou nadcházející rezervaci.</p><Link className="client-primary-action" href="/rozvrh">Vybrat lekci <PiArrowRight aria-hidden="true" /></Link></div>}
    </section>

    <section aria-labelledby="home-reservations-title" className="client-home-reservations">
      <div className="client-section-title"><h2 id="home-reservations-title">Moje rezervace</h2><button onClick={() => navigate("reservations")} type="button">Zobrazit vše</button></div>
      {upcoming.length ? <div className="client-reservation-list">{upcoming.slice(0, 3).map((booking) => <BookingRow booking={booking} busy={busy} key={booking.id} onCancel={openCancellation} />)}</div> : <p className="client-empty-line">Zatím tu není žádná rezervace.</p>}
    </section>

    <div className="client-quick-links">
      <button onClick={() => navigate("news")} type="button"><PiNewspaperClipping aria-hidden="true" /><span>Novinky</span><PiArrowRight aria-hidden="true" /></button>
      <button onClick={() => navigate("messages")} type="button"><PiEnvelopeSimple aria-hidden="true" /><span>Zprávy účtu</span><PiArrowRight aria-hidden="true" /></button>
    </div>
  </>;
}

function ReservationsView({ busy, history, openCancellation, period, setPeriod, upcoming }: { busy: boolean; history: Booking[]; openCancellation: (booking: Booking) => Promise<void>; period: ReservationPeriod; setPeriod: (period: ReservationPeriod) => void; upcoming: Booking[] }) {
  const items = period === "upcoming" ? upcoming : history;
  return <section className="client-view" aria-labelledby="reservations-title">
    <p className="client-view-eyebrow">Studio Balance</p><h1 id="reservations-title">Moje rezervace</h1>
    <div className="client-segmented" role="tablist" aria-label="Období rezervací"><button aria-selected={period === "upcoming"} onClick={() => setPeriod("upcoming")} role="tab" type="button">Nadcházející</button><button aria-selected={period === "history"} onClick={() => setPeriod("history")} role="tab" type="button">Minulé</button></div>
    {items.length ? <div className="client-reservation-list">{items.map((booking) => <BookingRow booking={booking} busy={busy} key={booking.id} onCancel={period === "upcoming" ? openCancellation : undefined} />)}</div> : <div className="client-empty-state"><p>{period === "upcoming" ? "Nemáte žádné nadcházející rezervace." : "Historie rezervací je zatím prázdná."}</p>{period === "upcoming" && <Link className="client-primary-action" href="/rozvrh">Vybrat lekci <PiArrowRight aria-hidden="true" /></Link>}</div>}
  </section>;
}

function BookingRow({ booking, busy, onCancel }: { booking: Booking; busy: boolean; onCancel?: ((booking: Booking) => Promise<void>) | undefined }) {
  return <article className="client-booking-row">
    <div><strong>{booking.session.classType.name}</strong><span>{formatStudioDate(booking.session.startAt, { weekday: "long", day: "numeric", month: "numeric" })} · {lessonTime(booking)}</span><span>{booking.session.instructor.displayName}</span>{booking.fee && <span>Poplatek {formatPrice(booking.fee)} ve studiu</span>}</div>
    {onCancel ? <button disabled={busy} onClick={() => void onCancel(booking)} type="button">Zrušit</button> : <span className="booking-status-text">{bookingLabels[booking.status]}</span>}
  </article>;
}

function FavoritesView({ busy, classTypes, favoriteIds, toggleFavorite }: { busy: boolean; classTypes: ClassType[]; favoriteIds: Set<string>; toggleFavorite: (item: ClassType) => Promise<void> }) {
  return <section className="client-view" aria-labelledby="favorites-title"><p className="client-view-eyebrow">Váš pohyb</p><h1 id="favorites-title">Oblíbené lekce</h1><p className="client-view-intro">Uložte si lekce, ke kterým se chcete rychle vracet.</p><div className="client-favorite-grid">{classTypes.map((item) => <article className="client-favorite-card" key={item.id}>{item.heroImage && <Link href={`/lekce/${item.slug}`}><Image alt={item.heroImage.alt} height={500} src={item.heroImage.src} width={700} /></Link>}<div><Link href={`/lekce/${item.slug}`}><h2>{item.name}</h2></Link><p>{item.tagline}</p><button aria-label={`${favoriteIds.has(item.id) ? "Odebrat" : "Přidat"} ${item.name} ${favoriteIds.has(item.id) ? "z" : "do"} oblíbených`} disabled={busy} onClick={() => void toggleFavorite(item)} type="button">{favoriteIds.has(item.id) ? <PiHeartFill aria-hidden="true" /> : <PiHeart aria-hidden="true" />}<span>{favoriteIds.has(item.id) ? "Oblíbená" : "Přidat"}</span></button></div></article>)}</div></section>;
}

function NewsView({ items }: { items: NewsItem[] }) {
  return <section className="client-view" aria-labelledby="news-title"><p className="client-view-eyebrow">Ze studia</p><h1 id="news-title">Novinky</h1>{items.length ? <div className="client-news-list">{items.map((item) => <article key={item.id}><time>{formatStudioDate(item.publishedAt, { day: "numeric", month: "long", year: "numeric" })}</time><h2>{item.title}</h2><p className="client-news-summary">{item.summary}</p><p>{item.body}</p></article>)}</div> : <div className="client-empty-state"><p>Jakmile bude ve studiu něco nového, najdete to tady.</p></div>}</section>;
}

function MessagesView({ items }: { items: AccountNotification[] }) {
  return <section className="client-view" aria-labelledby="messages-title"><p className="client-view-eyebrow">Váš účet</p><h1 id="messages-title">Zprávy účtu</h1>{items.length ? <div className="client-news-list">{items.map((item) => <article key={item.id}><time>{formatStudioDate(item.createdAt, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</time><h2>{item.title}</h2><p>{item.body}</p></article>)}</div> : <div className="client-empty-state"><p>Zatím tu nemáte žádné zprávy.</p></div>}</section>;
}

function ProfileView({ busy, profile, saveProfile }: { busy: boolean; profile: Profile; saveProfile: (event: FormEvent<HTMLFormElement>) => Promise<void> }) {
  return <section className="client-view client-profile-view" aria-labelledby="profile-title"><p className="client-view-eyebrow">Váš účet</p><h1 id="profile-title">Profil</h1><div className="client-profile-layout"><form className="client-profile-form" onSubmit={(event) => void saveProfile(event)}><label>Jméno<input defaultValue={profile.firstName ?? ""} name="firstName" required /></label><label>Příjmení<input defaultValue={profile.lastName ?? ""} name="lastName" required /></label><label>Telefon<input autoComplete="tel" defaultValue={profile.phone ?? ""} name="phone" required type="tel" /></label><label>E-mail<input disabled value={profile.email} /></label><button className="client-primary-action" disabled={busy} type="submit">Uložit údaje</button></form><aside className="client-settings"><h2><PiGear aria-hidden="true" /> Nastavení</h2><p>Přihlášení a zabezpečení účtu spravuje Studio Balance. Platby probíhají pouze ve studiu.</p><form action="/auth/logout" method="post"><button type="submit"><PiSignOut aria-hidden="true" /> Odhlásit se</button></form></aside></div></section>;
}

function ClientBottomNavigation({ active, navigate }: { active: AccountView; navigate: (view: AccountView) => void }) {
  return <nav aria-label="Klientská aplikace" className="client-bottom-nav"><button aria-current={active === "home" ? "page" : undefined} onClick={() => navigate("home")} type="button"><PiHouse aria-hidden="true" /><span>Domů</span></button><Link href="/rozvrh"><PiCalendarBlank aria-hidden="true" /><span>Rozvrh</span></Link><button aria-current={active === "reservations" ? "page" : undefined} onClick={() => navigate("reservations")} type="button"><PiCalendarCheck aria-hidden="true" /><span>Rezervace</span></button><button aria-current={active === "favorites" ? "page" : undefined} onClick={() => navigate("favorites")} type="button"><PiHeart aria-hidden="true" /><span>Oblíbené</span></button><button aria-current={active === "profile" ? "page" : undefined} onClick={() => navigate("profile")} type="button"><PiUser aria-hidden="true" /><span>Profil</span></button></nav>;
}

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("cs-CZ", { hour: "2-digit", hour12: false, timeZone: "Europe/Prague" }).format(new Date()));
  if (hour < 11) return "Dobré ráno";
  if (hour < 18) return "Dobré odpoledne";
  return "Dobrý večer";
}

function vocative(name: string) {
  const normalized = name.trim();
  if (/a$/i.test(normalized)) return `${normalized.slice(0, -1)}o`;
  return normalized;
}

function lessonTime(booking: Booking) {
  const start = formatStudioDate(booking.session.startAt, { hour: "2-digit", minute: "2-digit" });
  const end = formatStudioDate(booking.session.endAt, { hour: "2-digit", minute: "2-digit" });
  return `${start}–${end}`;
}
