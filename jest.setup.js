// Jest setup for the component-render lane. The theme layer (ThemeProvider) and
// any component that transitively imports it pull in AsyncStorage, which has no
// implementation under the test environment. Use the library's official mock so
// those modules load.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
