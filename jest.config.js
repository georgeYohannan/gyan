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
  // Do not treat the mocks folder or setup file as tests.
  testPathIgnorePatterns: ['/node_modules/', '/__mocks__/'],
};
