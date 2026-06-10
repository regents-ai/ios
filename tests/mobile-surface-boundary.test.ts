import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Techtree mobile tab links to the owning operator surface without shipping command help', () => {
  const techtree = readFileSync('app/(tabs)/techtree.tsx', 'utf8');
  const hub = readFileSync('components/learn/InformationalHubScreen.tsx', 'utf8');

  assert.match(techtree, /https:\/\/github\.com\/regents-ai\/regents-cli/);
  assert.doesNotMatch(techtree, /pnpm add|regent techtree start/);
  assert.doesNotMatch(hub, /Clipboard|Copy install command|Copy start command/);
});

test('uuid uses the browser random source on native bundles', () => {
  const metroConfig = readFileSync('metro.config.js', 'utf8');

  assert.match(metroConfig, /moduleName === "uuid"/);
  assert.match(metroConfig, /uuid\/dist\/esm-browser\/index\.js/);
  assert.doesNotMatch(metroConfig, /uuid\/dist\/index\.js/);
});

test('mobile sign-in starts with ChatGPT before Regents account connection', () => {
  const login = readFileSync('app/auth/login.tsx', 'utf8');

  assert.match(login, /useChatGptAuth/);
  assert.match(login, /Sign in with ChatGPT/);
  assert.match(login, /Connect your Regents account/);
  assert.ok(login.indexOf('Sign in with ChatGPT') < login.indexOf('Connect your Regents account'));
});

test('ChatGPT login can render before Regents account setup is ready', () => {
  const rootLayout = readFileSync('app/_layout.tsx', 'utf8');
  const login = readFileSync('app/auth/login.tsx', 'utf8');
  const config = readFileSync('utils/mobilePublicConfig.ts', 'utf8');

  assert.match(rootLayout, /!canUseRegentsAccount && !isLoginRoute/);
  assert.match(rootLayout, /Redirect href="\/auth\/login"/);
  assert.match(login, /hasRegentsAccountConfig/);
  assert.match(config, /UUID_V4_PATTERN/);
});

test('ChatGPT auth exposes only safe session metadata to JavaScript', () => {
  const module = readFileSync('modules/regents-chatgpt-auth/src/RegentsChatGptAuthModule.ts', 'utf8');
  const nativeModule = readFileSync('modules/regents-chatgpt-auth/ios/RegentsChatGptAuthModule.swift', 'utf8');

  assert.match(module, /accountId: string/);
  assert.match(module, /planType: string \| null/);
  assert.match(module, /expiresAt: string/);
  assert.match(module, /isSignedIn: boolean/);
  assert.doesNotMatch(module, /accessToken|refreshToken/);
  assert.match(nativeModule, /"accountId"/);
  assert.match(nativeModule, /"planType"/);
  assert.match(nativeModule, /"expiresAt"/);
  assert.match(nativeModule, /"isSignedIn"/);
  assert.doesNotMatch(nativeModule, /"accessToken"|"refreshToken"/);
});
