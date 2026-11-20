/**
 * Whether the builder-only test tools are turned on.
 *
 * The test-only plan switch must not exist in a real build. This is the first of two gates that
 * keep it out:
 *
 *   1. HERE. The switch is only drawn when EXPO_PUBLIC_GYAN_TEST_TOOLS is exactly '1'. Anything
 *      else, including the setting not being there at all, means off. A real build that simply
 *      never sets it has no switch, which is the safe way round: forgetting hides the switch
 *      rather than showing it.
 *
 *   2. In the database. set_test_plan refuses anybody who is not a Gyan admin, and will only
 *      ever move an account onto a plan whose numbers are marked as stand-ins. So even if this
 *      file were wrong, nothing could happen.
 *
 * The name is written out in full rather than built up from pieces, because Expo swaps the
 * whole `process.env.EXPO_PUBLIC_...` text for its value when the app is built. A name put
 * together at the last moment would simply be empty.
 */
export function testToolsOn(): boolean {
  return process.env.EXPO_PUBLIC_GYAN_TEST_TOOLS === '1';
}
