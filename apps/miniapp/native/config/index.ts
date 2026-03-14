import type { UserConfigExport } from '@tarojs/taro';

const config: UserConfigExport = {
  projectName: 'wechat-article-exporter',
  date: '2024-1-1',
  designWidth: 375,
  deviceRatio: {
    375: 2,
    640: 2,
    750: 1,
    828: 1,
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  plugins: ['@tarojs/plugin-platform-h5'],
  framework: 'react',
  h5: {
    publicPath: '/',
    staticDirectory: 'static',
  },
  prebundle: {
    enable: false,
  },
};

export default config;
