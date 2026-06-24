const { getDefaultConfig } = require('expo/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

// Allow Metro to bundle .onnx model weight files as static binary assets
// so they are not stripped during compilation.
defaultConfig.resolver.assetExts.push('onnx');

module.exports = defaultConfig;
