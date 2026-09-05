export type StudioImage = { src: string; alt: string; width: number; height: number };
export type InstructorSummary = { id: string; displayName: string; portrait: StudioImage | null };
export type ClassInstructor = InstructorSummary & { bio: string; scheduleNote: string };
export type TeamContent = { title: string; body: string; photo: StudioImage | null };

export type Money = { amount: string; currency: "CZK" };

export type PublicSession = {
  arrivalAt: string;
  availability: "bookable" | "full" | "closed" | "cancelled" | "completed";
  changeNotice: string | null;
  classType: { name: string; slug: string; tagline: string };
  endAt: string;
  equipment: string;
  id: string;
  instructor: InstructorSummary;
  location: { address: string; name: string };
  price: Money;
  startAt: string;
  suitability: string;
  timezone: "Europe/Prague";
  whatToBring: string;
};

export type ClassType = {
  active?: boolean;
  arrivalLeadMinutes: number;
  audience: string;
  benefits: string;
  defaultEquipment: string;
  description: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  durationMinutes: number;
  heroImage: { alt: string; src: string } | null;
  id: string;
  name: string;
  practicalNotice: string;
  seoDescription: string;
  seoTitle: string;
  slug: string;
  suitableForBeginners: boolean;
  tagline: string;
  whatToBring: string;
};

export type ClassTypeDetail = ClassType & { upcomingSessions: PublicSession[]; instructors: ClassInstructor[] };

export type Profile = {
  email: string;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  profileComplete: boolean;
  roles: ("client" | "admin" | "super_admin")[];
  subject: string;
  termsVersion: string | null;
};

export type AccountNotification = {
  body: string;
  createdAt: string;
  id: string;
  kind: "booking_confirmed" | "booking_cancelled" | "lesson_reminder" | "session_changed" | "session_cancelled";
  readAt: string | null;
  title: string;
};

export type FavoriteClassType = {
  difficulty: number;
  favoritedAt: string;
  heroImage: { alt: string; src: string } | null;
  id: string;
  name: string;
  slug: string;
  tagline: string;
};

export type NewsItem = {
  body: string;
  id: string;
  publishedAt: string;
  summary: string;
  title: string;
};

export type Booking = {
  cancellationCutoffAt: string;
  createdAt: string;
  fee: Money | null;
  id: string;
  session: PublicSession;
  status: "reserved" | "cancelled_on_time" | "cancelled_late" | "attended" | "no_show" | "cancelled_by_studio";
};

export type CancellationPreview = {
  cutoffAt: string;
  fee: Money | null;
  mode: "on_time" | "late" | "free_change_window";
  paymentMethod: "at_studio";
};

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export async function apiRequest<Response>(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(path, { ...init, cache: "no-store", headers: { "content-type": "application/json", ...init?.headers } });
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as { error?: { code?: string; message?: string } } | undefined;
    throw new ApiError(body?.error?.code ?? "REQUEST_FAILED", body?.error?.message ?? "Požadavek se nepodařilo dokončit.", response.status);
  }
  return response.json() as Promise<Response>;
}

export function formatPrice(money: Money): string {
  return new Intl.NumberFormat("cs-CZ", { style: "currency", currency: money.currency, maximumFractionDigits: 0 }).format(Number(money.amount));
}

export function formatStudioDate(value: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("cs-CZ", { ...options, timeZone: "Europe/Prague" }).format(new Date(value));
}
