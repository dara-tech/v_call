const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add support for .mjs extensions (required for lucide-react-native in older Expo versions)
config.resolver.sourceExts.push('mjs');

module.exports = config;
