"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { ApiError, apiRequest, formatPrice, formatStudioDate, type AccountNotification, type Booking, type CancellationPreview, type Profile } from "../lib/api-types";

const bookingLabels: Record<Booking["status"], string> = {
  attended: "Absolvováno",
  cancelled_by_studio: "Zrušeno studiem",
  cancelled_late: "Pozdní storno",
  cancelled_on_time: "Zrušeno včas",
  no_show: "Neúčast",
  reserved: "Rezervováno"
};

export function AccountDashboard() {
  const [profile, setProfile] = useState<Profile>();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [notifications, setNotifications] = useState<AccountNotification[]>([]);
  const [selected, setSelected] = useState<{ booking: Booking; preview: CancellationPreview }>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [nextProfile, nextBookings, nextNotifications] = await Promise.all([
        apiRequest<Profile>("/api/v1/me"),
        apiRequest<{ items: Booking[] }>("/api/v1/me/bookings"),
        apiRequest<{ items: AccountNotification[] }>("/api/v1/me/notifications")
      ]);
      setProfile(nextProfile);
      setBookings(nextBookings.items);
      setNotifications(nextNotifications.items);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Účet se nepodařilo načíst.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

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
    } finally {
      setBusy(false);
    }
  }

  async function openCancellation(booking: Booking) {
    setBusy(true);
    setMessage(undefined);
    try {
      const preview = await apiRequest<CancellationPreview>(`/api/v1/me/bookings/${booking.id}/cancellation-preview`);
      setSelected({ booking, preview });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Storno se nepodařilo připravit.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmCancellation() {
    if (!selected) return;
    setBusy(true);
    try {
      await apiRequest<Booking>(`/api/v1/me/bookings/${selected.booking.id}/cancel`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ lateCancellationConfirmed: selected.preview.mode === "late" })
      });
      setSelected(undefined);
      setMessage("Rezervace byla zrušena.");
      await load();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Rezervaci se nepodařilo zrušit.");
    } finally {
      setBusy(false);
    }
  }

  if (!profile && !message) return <p className="schedule-message" role="status">Načítáme váš účet…</p>;
  if (!profile) return <p className="schedule-message" role="alert">{message}</p>;

  const upcoming = bookings.filter((booking) => booking.status === "reserved" && new Date(booking.session.startAt) > new Date());
  const history = bookings.filter((booking) => !upcoming.includes(booking));

  return (
    <div className="account-dashboard">
      <header className="account-welcome">
        <p className="eyebrow">Můj účet</p>
        <h1>Dobře, že jste tady{profile.firstName ? `, ${profile.firstName}` : ""}.</h1>
        <p>{profile.email}</p>
      </header>
      <div className="account-grid">
        <section className="account-main" aria-labelledby="upcoming-title">
          <div className="account-section-heading">
            <h2 id="upcoming-title">Moje nejbližší lekce</h2>
            <Link className="text-link" href="/rozvrh">Vybrat další lekci</Link>
          </div>
          {upcoming.length ? upcoming.map((booking) => (
            <article className="account-booking" key={booking.id}>
              <div>
                <p className="booking-date">{formatStudioDate(booking.session.startAt, { weekday: "long", day: "numeric", month: "long" })}</p>
                <h3>{booking.session.classType.name}</h3>
                <p>{formatStudioDate(booking.session.startAt, { hour: "2-digit", minute: "2-digit" })} · {booking.session.instructor.displayName}</p>
                <p>{booking.session.location.name}</p>
              </div>
              <div className="booking-actions">
                <span className="availability availability-bookable">{bookingLabels[booking.status]}</span>
                <button className="button button-secondary button-small" disabled={busy} onClick={() => void openCancellation(booking)} type="button">Zrušit rezervaci</button>
              </div>
            </article>
          )) : (
            <div className="account-empty">
              <p>Zatím nemáte žádnou nadcházející rezervaci.</p>
              <Link className="button" href="/rozvrh">Prohlédnout rozvrh</Link>
            </div>
          )}

          {history.length > 0 && (
            <div className="booking-history">
              <h2>Historie</h2>
              {history.map((booking) => (
                <div className="history-row" key={booking.id}>
                  <span>{formatStudioDate(booking.session.startAt, { day: "numeric", month: "numeric", year: "numeric" })}</span>
                  <strong>{booking.session.classType.name}</strong>
                  <span>{bookingLabels[booking.status]}</span>
                  {booking.fee && <span>Poplatek {formatPrice(booking.fee)} ve studiu</span>}
                </div>
              ))}
            </div>
          )}

          <section aria-labelledby="notifications-title" className="account-notifications">
            <div className="account-section-heading">
              <h2 id="notifications-title">Zprávy</h2>
              <p>Potvrzení rezervací a důležité změny.</p>
            </div>
            {notifications.length ? (
              <div className="notification-list">
                {notifications.map((notification) => (
                  <article className="notification-item" key={notification.id}>
                    <p className="booking-date">{formatStudioDate(notification.createdAt, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                    <h3>{notification.title}</h3>
                    <p>{notification.body}</p>
                  </article>
                ))}
              </div>
            ) : <p className="account-empty-message">Zatím tu nemáte žádné zprávy.</p>}
          </section>
        </section>

        <aside className="profile-card">
          <h2>Kontaktní údaje</h2>
          <form onSubmit={saveProfile}>
            <label>Jméno<input defaultValue={profile.firstName ?? ""} name="firstName" required /></label>
            <label>Příjmení<input defaultValue={profile.lastName ?? ""} name="lastName" required /></label>
            <label>Telefon<input autoComplete="tel" defaultValue={profile.phone ?? ""} name="phone" required type="tel" /></label>
            <button className="button button-secondary full-button" disabled={busy} type="submit">Uložit údaje</button>
          </form>
          {!profile.emailVerified && <p className="status-warning">E-mail ještě není ověřený. Bez ověření nelze rezervovat.</p>}
          <form action="/auth/logout" method="post"><button className="text-button" type="submit">Odhlásit se</button></form>
        </aside>
      </div>

      {message && <p className="account-message" role="status">{message}</p>}

      {selected && (
        <div className="modal-backdrop" role="presentation">
          <section aria-labelledby="cancel-title" aria-modal="true" className="cancel-dialog" role="dialog">
            <p className="eyebrow">Storno rezervace</p>
            <h2 id="cancel-title">Opravdu zrušit {selected.booking.session.classType.name}?</h2>
            {selected.preview.mode === "late" ? (
              <p>Při pozdním zrušení vznikne poplatek {formatPrice(selected.preview.fee!)}. Uhradíte ho ve studiu, nikoli online.</p>
            ) : (
              <p>Rezervaci rušíte včas. Místo se uvolní bez storno poplatku.</p>
            )}
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
