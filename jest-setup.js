// Reanimated's own test setup (see its Jest testing guide).
require('react-native-reanimated').setUpTests();

// AsyncStorage has native code, so tests use its official mock.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
