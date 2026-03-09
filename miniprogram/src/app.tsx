import { Component, PropsWithChildren } from 'react';
import { useLaunch } from '@tarojs/taro';
import '@vant/weapp/dist/index.css';
import './app.less';

function App({ children }: PropsWithChildren<any>) {
  useLaunch(() => {
    console.log('App launched.');
  });

  return children;
}

export default App;