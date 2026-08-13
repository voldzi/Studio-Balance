import Link from "next/link";
import { PiCalendarBlank, PiCalendarCheck, PiHeart, PiHouse, PiUser } from "react-icons/pi";

export function ClientRouteNavigation({ active }: { active: "schedule" | "none" }) {
  return <nav aria-label="Klientská aplikace" className="client-bottom-nav"><Link href="/muj-ucet"><PiHouse aria-hidden="true" /><span>Domů</span></Link><Link aria-current={active === "schedule" ? "page" : undefined} href="/rozvrh"><PiCalendarBlank aria-hidden="true" /><span>Rozvrh</span></Link><Link href="/muj-ucet?view=reservations"><PiCalendarCheck aria-hidden="true" /><span>Rezervace</span></Link><Link href="/muj-ucet?view=favorites"><PiHeart aria-hidden="true" /><span>Oblíbené</span></Link><Link href="/muj-ucet?view=profile"><PiUser aria-hidden="true" /><span>Profil</span></Link></nav>;
}
