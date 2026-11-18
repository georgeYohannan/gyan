module.exports = {
  preset: 'jest-expo',
  // Load the web version of Reanimated and Worklets so they run in Jest.
  resolver: 'react-native-reanimated/jest/resolver',
  setupFilesAfterEnv: ['<rootDir>/jest-setup.js'],
  // CSS files cannot run in Jest, so swap them for an empty file.
  moduleNameMapper: {
    '\\.css$': '<rootDir>/__mocks__/style-mock.js',
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
  },
  // Do not treat the mocks folder, the setup file, or the browser scripts as Jest tests.
  // The files in tests/ are Playwright scripts and are run with `npm run e2e`.
  testPathIgnorePatterns: ['/node_modules/', '/__mocks__/', '/tests/', '/test-results/'],
};
