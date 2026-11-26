// Which meeting-bot service Gyan uses.
//
// THIS IS THE WHOLE SWAP. To move to Vexa, Attendee or MeetingBaaS: write one file beside
// recall.ts that exports a `provider` matching the type in provider.ts, and change the line below
// to point at it. No screen changes, no database change, no other server function changes.
//
// docs/decisions/bot-provider.md has the comparison, the prices and what each swap would cost.
export { provider } from './recall.ts';
export * from './provider.ts';
export { platformFor, readMeetingLink, isPlatform } from './platforms.ts';
