export {};

declare global {
  interface Window {
    __plannerInstallPrompt?: BeforeInstallPromptEvent;
  }
}

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}
