const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Simple resolver matching working demo - NO ALIASES
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.includes("zustand")) {
    const result = require.resolve(moduleName);
    return context.resolveRequest(context, result, platform);
  }

  if (moduleName.includes("rpc-websockets")) {
    const result = require.resolve(moduleName);
    return context.resolveRequest(context, result, platform);
  }

  if (moduleName === "uuid") {
    return {
      filePath: path.resolve(__dirname, 'node_modules/uuid/dist/index.js'),
      type: 'sourceFile',
    };
  }

  if (moduleName === "jose") {
    return {
      filePath: path.resolve(
        __dirname,
        'node_modules/@privy-io/js-sdk-core/node_modules/jose/dist/browser/index.js'
      ),
      type: 'sourceFile',
    };
  }

  if (moduleName === "crypto") {
    return {
      filePath: require.resolve('react-native-quick-crypto'),
      type: 'sourceFile',
    };
  }

  if (moduleName === "zlib") {
    return {
      filePath: path.resolve(__dirname, 'node_modules/browserify-zlib/lib/index.js'),
      type: 'sourceFile',
    };
  }

  return context.resolveRequest(context, moduleName, platform);
};

config.resolver = {
  ...config.resolver,
  unstable_enableSymlinks: false,
  unstable_enablePackageExports: true,
};

module.exports = config;
