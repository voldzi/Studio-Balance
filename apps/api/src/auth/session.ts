export type StudioRole = "client" | "admin" | "super_admin";

export type StudioSession = {
  email: string;
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
  mfaVerified: boolean;
  roles: StudioRole[];
  subject: string;
};
