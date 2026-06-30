import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

function read(path: string) {
  return readFileSync(path, 'utf8');
}

test('message setup no longer requires a separate message network', () => {
  const layout = read('app/_layout.tsx');
  const config = read('utils/mobilePublicConfig.ts');
  const envExample = read('.env.example');

  assert.doesNotMatch(layout, /RegentsXmtpProvider|xmtpEnvironment|message network/);
  assert.doesNotMatch(config, /EXPO_PUBLIC_XMTP_ENV|parseXmtpEnvironment|XmtpEnvironment/);
  assert.doesNotMatch(envExample, /EXPO_PUBLIC_XMTP_ENV/);
});

test('app package and source have no XMTP message transport dependency', () => {
  const packageJson = read('package.json');
  const packageLock = read('package-lock.json');
  const regentClient = read('utils/regentApi/client.ts');
  const regentTypes = read('types/regents.ts');

  assert.equal(existsSync('components/xmtp/RegentsXmtpProvider.tsx'), false);
  assert.equal(existsSync('utils/xmtp/secureMessagingConfig.ts'), false);
  assert.equal(existsSync('utils/xmtp/secureMessagingKeys.ts'), false);
  assert.doesNotMatch(packageJson, /@xmtp\/react-native-sdk/);
  assert.doesNotMatch(packageLock, /@xmtp\/react-native-sdk|XMTPReactNative/);
  assert.doesNotMatch(regentClient, /xmtp|Xmtp|registerPhone|linkXmtp|MessageContact/);
  assert.doesNotMatch(regentTypes, /xmtp|Xmtp|MessageContact|PhoneXmtp|AgentXmtp/);
});

test('message screens use the backend agent-work path without channel setup copy', () => {
  const messageTab = read('app/(tabs)/message.tsx');
  const detail = read('app/message/[id].tsx');
  const visibleInternalWords = /<Text[^>]*>[^<]*(XMTP|inbox|installation|Platform|secure channel)[^<]*<\/Text>/i;

  assert.match(messageTab, /Message your agent/);
  assert.match(messageTab, /Agent messages, payment requests, and work updates/);
  assert.match(messageTab, /regentApi\.listMessageThreads/);
  assert.match(detail, /regentApi\.sendMessageThreadMessage/);
  assert.match(detail, /regentApi\.resolveMessageThreadApproval/);
  assert.match(detail, /Approve payment/);
  assert.doesNotMatch(messageTab, /Lookup Recent Addresses|Lookup Regent Users|connectWalletChannel/);
  assert.doesNotMatch(detail, /Connect secure channel|connectAgentChannel/);
  assert.doesNotMatch(messageTab, visibleInternalWords);
  assert.doesNotMatch(detail, visibleInternalWords);
});
