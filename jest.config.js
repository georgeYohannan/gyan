module.exports = {
  preset: 'jest-expo',
  // Load the web version of Reanimated and Worklets so they run in Jest.
  resolver: 'react-native-reanimated/jest/resolver',
  // react-native-gesture-handler ships its own stubs; without them a swipeable row throws
  // in Jest. It must run BEFORE the test framework, which is what setupFiles is for.
  setupFiles: ['<rootDir>/node_modules/react-native-gesture-handler/jestSetup.js'],
  setupFilesAfterEnv: ['<rootDir>/jest-setup.js'],
  // CSS files cannot run in Jest, so swap them for an empty file.
  moduleNameMapper: {
    '\\.css$': '<rootDir>/__mocks__/style-mock.js',
    // Jest runs the WEB build of Reanimated and Worklets (see `resolver` above), but it was
    // picking gesture handler's NATIVE file for this one module -- and that one asks Worklets
    // for a UI runtime, which the web build throws on by design, because a web page has no
    // second thread. The throw happened in a queued microtask after a test file had finished,
    // so every test passed and the suite still failed. Pairing it with the web build of
    // everything else is the fix. The real web app was never affected: that was checked by
    // running the browser scripts against a Home full of swipeable rows.
    'installUIRuntimeBindings$':
      '<rootDir>/node_modules/react-native-gesture-handler/src/handlers/gestures/installUIRuntimeBindings.web.ts',
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
  },
  // Do not treat the mocks folder, the setup file, or the browser scripts as Jest tests.
  // The files in tests/ are Playwright scripts and are run with `npm run e2e`.
  testPathIgnorePatterns: ['/node_modules/', '/__mocks__/', '/tests/', '/test-results/'],
};
