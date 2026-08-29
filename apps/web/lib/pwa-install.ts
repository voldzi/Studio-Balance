export type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export const installPromptAvailableEvent = "studio-balance-install-prompt-available";
export const appInstalledEvent = "studio-balance-app-installed";

let deferredInstallPrompt: DeferredInstallPrompt | undefined;

export function rememberInstallPrompt(event: Event) {
  event.preventDefault();
  deferredInstallPrompt = event as DeferredInstallPrompt;
  window.dispatchEvent(new Event(installPromptAvailableEvent));
}

export function currentInstallPrompt() {
  return deferredInstallPrompt;
}

export function clearInstallPrompt() {
  deferredInstallPrompt = undefined;
}
