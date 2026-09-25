/**
 * Public legal URLs shown on the in-app "Legal & accessibility" screen.
 *
 * Apple 5.1.1(i) and 3.1.2 (auto-renewable subscriptions) require the privacy
 * policy and terms of use to be reachable inside the app, and the German DDG §5
 * requires the Impressum to be "easily recognisable and directly reachable".
 * Use the same URLs as in App Store Connect. Empty entries are hidden.
 */
export const LEGAL_PRIVACY_URL = "https://reminders-plus.vercel.app/privacy";
export const LEGAL_IMPRINT_URL = "https://reminders-plus.vercel.app/impressum";
/** Apple's standard EULA applies unless a custom one is set in App Store Connect. */
export const LEGAL_TERMS_URL =
  "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
/** Contact for accessibility feedback (BFSG / EN 301 549 feedback mechanism). */
export const LEGAL_ACCESSIBILITY_FEEDBACK_EMAIL = "reminders-plus@benediktschnupp.com";
