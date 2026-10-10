"use client";

import Image from "next/image";
import Link from "next/link";

import styles from "./review-qr-print.module.css";

export function ReviewQrPrint() {
  return <div className={styles.page}>
    <section className={styles.card} aria-labelledby="review-qr-title">
      <Image src="/images/studio-balance/brand-logo.jpg" width={180} height={108} alt="Studio Balance" className={styles.logo} unoptimized />
      <h1 id="review-qr-title">Jak se vám u nás líbí?</h1>
      <p>Naskenujte kód telefonem a napište nám svou zkušenost.</p>
      <Image src="/images/studio-balance/reviews-qr.svg" width={360} height={360} alt="QR kód pro otevření formuláře recenze Studia Balance" className={styles.qr} loading="eager" unoptimized />
      <p className={styles.address}><a href="https://studio-balance.cz/recenze/napsat">studio-balance.cz/recenze/napsat</a></p>
      <p className={styles.note}>Recenze se zveřejní po kontrole. Děkujeme!</p>
    </section>
    <div className={styles.actions}>
      <button type="button" className="button button-primary" onClick={() => window.print()}>Vytisknout QR kód</button>
      <a className="button button-secondary" href="/images/studio-balance/reviews-qr.png" download="studio-balance-recenze-qr.png">Stáhnout QR obrázek</a>
      <Link href="/admin">Zpět do administrace</Link>
      <p>Vytištěnou kartičku můžete položit u recepce. Klienti napíšou recenzi na svém telefonu, bez přihlášení.</p>
    </div>
  </div>;
}
