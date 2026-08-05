module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // If you have 'react-refresh/babel' here, DELETE that line!
      // Keep reanimated or other plugins here if you have them, e.g.:
      // 'react-native-reanimated/plugin',
    ],
  };
};