"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";

import { ApiError, apiRequest, formatPrice, formatStudioDate, type Booking, type Profile, type PublicSession } from "../lib/api-types";

import { useStudioStatus } from "./studio-status";

const termsVersion = "2026-10-04";

export function BookingFlow({ sessionId }: { sessionId: string }) {
  const studio = useStudioStatus();
  const [profile, setProfile] = useState<Profile>();
  const [session, setSession] = useState<PublicSession>();
  const [booking, setBooking] = useState<Booking>();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [withCompanion, setWithCompanion] = useState(false);
  const [companionName, setCompanionName] = useState("");
  const [companionResponsibilityAccepted, setCompanionResponsibilityAccepted] = useState(false);
  const reservationAttempt = useRef<{ body: string; key: string } | null>(null);

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
    if (withCompanion && (companionName.trim().length < 2 || !companionResponsibilityAccepted)) {
      setMessage("Doplňte jméno a příjmení doprovodu a potvrďte odpovědnost za obě místa.");
      return;
    }
    const body = JSON.stringify({ sessionId: session.id, termsVersion, termsAccepted: true,
      ...(withCompanion ? { companionName: companionName.trim(), companionResponsibilityAccepted: true } : {}) });
    if (reservationAttempt.current?.body !== body) reservationAttempt.current = { body, key: crypto.randomUUID() };
    setBusy(true);
    setMessage(undefined);
    try {
      const created = await apiRequest<Booking>("/api/v1/bookings", {
        method: "POST",
        headers: { "Idempotency-Key": reservationAttempt.current.key },
        body
      });
      setBooking(created);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Rezervaci se nepodařilo dokončit.");
    } finally {
      setBusy(false);
    }
  }

  if (!studio.open) return <p className="schedule-message" role="status">{studio.announcement}</p>;
  if (message && (!profile || !session)) return <p className="schedule-message" role="alert">{message}</p>;
  if (!profile || !session) return <p className="schedule-message" role="status">Připravujeme potvrzení rezervace…</p>;

  if (booking) {
    return (
      <section className="booking-success" aria-labelledby="booking-success-title">
        <p className="eyebrow">Hotovo</p>
        <h1 id="booking-success-title">{booking.companionBooking ? "Obě místa jsou rezervovaná." : "Vaše místo je rezervované."}</h1>
        <p className="detail-lead">{booking.session.classType.name}</p>
        <p>{formatStudioDate(booking.session.startAt, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</p>
        <p>Přijďte prosím v {formatStudioDate(booking.session.arrivalAt, { hour: "2-digit", minute: "2-digit" })}. Platba {formatPrice({ ...booking.session.price, amount: (Number(booking.session.price.amount) * (booking.companionBooking ? 2 : 1)).toFixed(2) })} {booking.companionBooking ? "za obě místa " : ""}proběhne až ve studiu.</p>
        {booking.companionBooking && <p>Doprovod: <strong>{booking.companionBooking.participant?.name}</strong>. Každé místo můžete v účtu zrušit zvlášť. Informace přicházejí na váš účet; doprovod o lekci informujte vy.</p>}
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
            <h2>Pro koho rezervujete?</h2>
            <label className="check-label">
              <input checked={withCompanion} disabled={busy} onChange={(event) => { setWithCompanion(event.target.checked); setCompanionResponsibilityAccepted(false); }} type="checkbox" />
              <span>Rezervovat pro sebe a jeden doprovod</span>
            </label>
            {withCompanion && <div>
              <label>Jméno a příjmení doprovodu<input autoComplete="off" disabled={busy} value={companionName} onChange={(event) => { setCompanionName(event.target.value); setCompanionResponsibilityAccepted(false); }} minLength={2} maxLength={200} required /></label>
              <p>Doprovod nepotřebuje účet. Zkontrolujte spolu, že nemá vlastní rezervaci na stejnou lekci.</p>
              <p><strong>Celkem {formatPrice({ ...session.price, amount: (Number(session.price.amount) * 2).toFixed(2) })} za obě místa</strong>, platba ve studiu.</p>
              <label className="check-label"><input checked={companionResponsibilityAccepted} disabled={busy} onChange={(event) => setCompanionResponsibilityAccepted(event.target.checked)} type="checkbox" /><span>Souhlasím, že za své místo i místo doprovodu odpovídám já. Za každé pozdě zrušené místo nebo neúčast uhradím ve studiu poplatek {formatPrice(session.price)}. Doprovod seznámím s podmínkami.</span></label>
            </div>}
            <h2>Storno a platba</h2>
            <p>Rezervaci můžete bez poplatku zrušit nejpozději 24 hodin před začátkem. Při pozdějším zrušení vzniká poplatek {formatPrice(session.price)}.</p>
            <p>Nic neplatíte online. Lekci i případný storno poplatek hradíte pouze ve studiu.</p>
            {profile.termsVersion !== termsVersion && (
              <label className="check-label">
                <input checked={termsAccepted} disabled={busy} onChange={(event) => setTermsAccepted(event.target.checked)} type="checkbox" />
                <span>Rozumím storno podmínkám a souhlasím s jejich verzí z 4. 10. 2026. Každé místo se ruší samostatně; při neúčasti vzniká poplatek ve výši ceny místa.</span>
              </label>
            )}
            <button className="button full-button" disabled={busy || !termsAccepted || (withCompanion && (!companionResponsibilityAccepted || companionName.trim().length < 2)) || session.availability !== "bookable"} onClick={() => void reserve()} type="button">
              {busy ? "Ověřujeme místa…" : withCompanion ? "Potvrdit rezervaci pro oba" : "Potvrdit rezervaci"}
            </button>
          </>
        )}
        {message && <p className="form-error" role="alert">{message}</p>}
      </section>
    </div>
  );
}
