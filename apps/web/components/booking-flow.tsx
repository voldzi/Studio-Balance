"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { ApiError, apiRequest, formatPrice, formatStudioDate, type Booking, type Profile, type PublicSession } from "../lib/api-types";

const termsVersion = "2026-08-04";

export function BookingFlow({ sessionId }: { sessionId: string }) {
  const [profile, setProfile] = useState<Profile>();
  const [session, setSession] = useState<PublicSession>();
  const [booking, setBooking] = useState<Booking>();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void Promise.all([
      apiRequest<Profile>("/api/v1/me"),
      apiRequest<PublicSession>(`/api/v1/sessions/${sessionId}`)
    ]).then(([nextProfile, nextSession]) => {
      setProfile(nextProfile);
      setSession(nextSession);
      setTermsAccepted(nextProfile.termsVersion === termsVersion);
    }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Rezervaci se nepodařilo načíst."));
  }, [sessionId]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(undefined);
    const data = new FormData(event.currentTarget);
    try {
      const updated = await apiRequest<Profile>("/api/v1/me", {
        method: "PATCH",
        body: JSON.stringify({
          firstName: data.get("firstName"),
          lastName: data.get("lastName"),
          phone: data.get("phone")
        })
      });
      setProfile(updated);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Profil se nepodařilo uložit.");
    } finally {
      setBusy(false);
    }
  }

  async function reserve() {
    if (!session || !profile) return;
    if (!termsAccepted) {
      setMessage("Před první rezervací potvrďte prosím storno podmínky.");
      return;
    }
    setBusy(true);
    setMessage(undefined);
    try {
      const created = await apiRequest<Booking>("/api/v1/bookings", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ sessionId: session.id, termsVersion, termsAccepted: true })
      });
      setBooking(created);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Rezervaci se nepodařilo dokončit.");
    } finally {
      setBusy(false);
    }
  }

  if (message && (!profile || !session)) return <p className="schedule-message" role="alert">{message}</p>;
  if (!profile || !session) return <p className="schedule-message" role="status">Připravujeme potvrzení rezervace…</p>;

  if (booking) {
    return (
      <section className="booking-success" aria-labelledby="booking-success-title">
        <p className="eyebrow">Hotovo</p>
        <h1 id="booking-success-title">Vaše místo je rezervované.</h1>
        <p className="detail-lead">{booking.session.classType.name}</p>
        <p>{formatStudioDate(booking.session.startAt, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</p>
        <p>Přijďte prosím v {formatStudioDate(booking.session.arrivalAt, { hour: "2-digit", minute: "2-digit" })}. Platba {formatPrice(booking.session.price)} proběhne až ve studiu.</p>
        <div className="actions">
          <Link className="button" href="/muj-ucet">Moje rezervace</Link>
          <Link className="text-link" href="/rozvrh">Zpět na rozvrh</Link>
        </div>
      </section>
    );
  }

  return (
    <div className="booking-layout">
      <section className="booking-summary" aria-labelledby="booking-title">
        <p className="eyebrow">Potvrzení rezervace</p>
        <h1 id="booking-title">{session.classType.name}</h1>
        <p className="detail-lead">{formatStudioDate(session.startAt, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</p>
        <dl className="detail-facts compact-facts">
          <div><dt>Příchod</dt><dd>{formatStudioDate(session.arrivalAt, { hour: "2-digit", minute: "2-digit" })}</dd></div>
          <div><dt>Lekci vede</dt><dd>{session.instructor.displayName}</dd></div>
          <div><dt>Cena</dt><dd>{formatPrice(session.price)}, platba ve studiu</dd></div>
          <div><dt>Místo</dt><dd>{session.location.address}</dd></div>
        </dl>
      </section>

      <section className="booking-form-card" aria-label="Údaje a storno podmínky">
        {!profile.profileComplete ? (
          <form onSubmit={saveProfile}>
            <h2>Doplňte své údaje</h2>
            <p>Potřebujeme je jen pro správu vaší rezervace.</p>
            <label>Jméno<input defaultValue={profile.firstName ?? ""} name="firstName" required maxLength={100} /></label>
            <label>Příjmení<input defaultValue={profile.lastName ?? ""} name="lastName" required maxLength={100} /></label>
            <label>Telefon<input autoComplete="tel" defaultValue={profile.phone ?? ""} name="phone" required minLength={7} maxLength={30} type="tel" /></label>
            <button className="button full-button" disabled={busy} type="submit">{busy ? "Ukládáme…" : "Uložit a pokračovat"}</button>
          </form>
        ) : (
          <>
            <h2>Storno a platba</h2>
            <p>Rezervaci můžete bez poplatku zrušit nejpozději 24 hodin před začátkem. Při pozdějším zrušení vzniká poplatek {formatPrice(session.price)}.</p>
            <p>Nic neplatíte online. Lekci i případný storno poplatek hradíte pouze ve studiu.</p>
            {profile.termsVersion !== termsVersion && (
              <label className="check-label">
                <input checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} type="checkbox" />
                <span>Rozumím storno podmínkám a souhlasím s jejich verzí z 4. 8. 2026.</span>
              </label>
            )}
            <button className="button full-button" disabled={busy || !termsAccepted || session.availability !== "bookable"} onClick={() => void reserve()} type="button">
              {busy ? "Ověřujeme místo…" : "Potvrdit rezervaci"}
            </button>
          </>
        )}
        {message && <p className="form-error" role="alert">{message}</p>}
      </section>
    </div>
  );
}
