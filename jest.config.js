// Component-render test lane (jest-expo + Testing Library). This is SEPARATE
// from the pure-logic `node --test` lane (tests/*.test.ts, run by test:app).
// It only picks up component-tests/*.test.tsx so the two lanes never overlap.
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/component-tests/**/*.test.tsx'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    // Mirror the tsconfig "@/*" -> "./*" path alias.
    '^@/(.*)$': '<rootDir>/$1',
  },
};
