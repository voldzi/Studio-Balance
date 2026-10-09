"use client";

import Link from "next/link";
import { PiCalendarBlank, PiCalendarCheck, PiChatCircleText, PiNewspaperClipping, PiUser } from "react-icons/pi";

import { clientNavigationItems, type AccountView } from "../lib/client-navigation";

const icons = {
  schedule: PiCalendarBlank,
  reservations: PiCalendarCheck,
  news: PiNewspaperClipping,
  messages: PiChatCircleText,
  profile: PiUser
};

export function ClientBottomNavigation({ active, navigate }: {
  active: AccountView | "schedule" | "none";
  navigate?: (view: AccountView) => void;
}) {
  const activeItem = active === "favorites" ? "profile" : active;
  return <nav aria-label="Klientská aplikace" className="client-bottom-nav">
    {clientNavigationItems.map((item) => {
      const Icon = icons[item.id];
      const content = <><Icon aria-hidden="true" /><span>{item.label}</span></>;
      const current = activeItem === item.id ? "page" : undefined;
      if (navigate && item.id !== "schedule") {
        const view = item.id;
        return <button aria-current={current} key={item.id} onClick={() => navigate(view)} type="button">{content}</button>;
      }
      return <Link aria-current={current} href={item.href} key={item.id}>{content}</Link>;
    })}
  </nav>;
}
