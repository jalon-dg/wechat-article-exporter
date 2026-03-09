export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/search/search',
    'pages/order/order',
    'pages/orders/orders',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: '公众号电子书',
    navigationBarTextStyle: 'black',
  },
  tabBar: {
    color: '#666666',
    selectedColor: '#1989fa',
    backgroundColor: '#ffffff',
    borderStyle: 'black',
    list: [
      {
        pagePath: 'pages/index/index',
        text: '首页',
        iconPath: 'assets/home.png',
        selectedIconPath: 'assets/home-active.png',
      },
      {
        pagePath: 'pages/orders/orders',
        text: '订单',
        iconPath: 'assets/order.png',
        selectedIconPath: 'assets/order-active.png',
      },
    ],
  },
});