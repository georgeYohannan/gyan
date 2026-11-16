import { Redirect } from 'expo-router';

/** A logged-out person who opens the bare address (/) lands on the Log in screen. */
export default function AuthIndex() {
  return <Redirect href="/log-in" />;
}
