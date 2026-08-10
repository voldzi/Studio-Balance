const socialProfiles = [
  {
    href: "https://www.instagram.com/studiobalancenl",
    label: "Instagram",
  },
  {
    href: "https://www.facebook.com/share/1arpYabKhn/",
    label: "Facebook",
  },
] as const;

type SocialLinksProps = {
  compact?: boolean;
};

export function SocialLinks({ compact = false }: SocialLinksProps) {
  return (
    <nav className={compact ? "social-links social-links-compact" : "social-links"} aria-label="Sociální sítě Studia Balance">
      {socialProfiles.map((profile) => (
        <a href={profile.href} key={profile.label} rel="noreferrer" target="_blank">
          <span>{profile.label}</span>
          <span aria-hidden="true">↗</span>
        </a>
      ))}
    </nav>
  );
}
