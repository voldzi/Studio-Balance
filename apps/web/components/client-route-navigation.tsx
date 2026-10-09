import { ClientBottomNavigation } from "./client-bottom-navigation";

export function ClientRouteNavigation({ active }: { active: "schedule" | "none" }) {
  return <ClientBottomNavigation active={active} />;
}
