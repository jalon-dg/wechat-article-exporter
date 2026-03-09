import { useState } from 'react';
import { View, Text, Image } from '@tarojs/components';
import { Button, Field, Toast } from 'vant';
import { api } from '../../utils/request';
import './index.less';

export default function Index() {
  const [bizName, setBizName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!bizName.trim()) {
      Toast.fail('请输入公众号名称');
      return;
    }
    if (!email.trim()) {
      Toast.fail('请输入邮箱');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Toast.fail('请输入有效的邮箱');
      return;
    }

    setLoading(true);
    try {
      // 先搜索公众号确认存在
      const searchResult = await api.searchBiz(bizName);
      if (!searchResult?.list || searchResult.list.length === 0) {
        Toast.fail('未找到该公众号');
        setLoading(false);
        return;
      }

      // 创建订单
      const order = await api.createOrder({
        bizName,
        email,
        price: 500,
      });

      Toast.success('订单创建成功');
      // 跳转到订单页面
      Taro.navigateTo({
        url: `/pages/order/order?orderId=${order.orderId}&amount=${order.amount}&bizName=${encodeURIComponent(bizName)}`,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="index-page">
      <View className="header">
        <Image
          className="logo"
          src="https://down.mptext.top/assets/logo.svg"
          mode="aspectFit"
        />
        <Text className="title">公众号电子书</Text>
        <Text className="desc">输入公众号名称和邮箱，付费后生成电子书发送到邮箱</Text>
      </View>

      <View className="form">
        <View className="form-item">
          <Field
            value={bizName}
            onChange={(e) => setBizName(e.detail)}
            label="公众号"
            placeholder="请输入公众号名称"
            border={false}
          />
        </View>
        <View className="form-item">
          <Field
            value={email}
            onChange={(e) => setEmail(e.detail)}
            label="邮箱"
            placeholder="请输入接收邮箱"
            type="email"
            border={false}
          />
        </View>

        <View className="price-info">
          <Text className="price-label">价格：</Text>
          <Text className="price-value">¥5.00</Text>
        </View>

        <Button
          type="primary"
          block
          loading={loading}
          onClick={handleSearch}
          className="submit-btn"
        >
          创建订单
        </Button>
      </View>

      <View className="features">
        <View className="feature-item">
          <Text className="feature-icon">📚</Text>
          <Text className="feature-title">EPUB格式</Text>
          <Text className="feature-desc">支持主流阅读器</Text>
        </View>
        <View className="feature-item">
          <Text className="feature-icon">📧</Text>
          <Text className="feature-title">邮箱发送</Text>
          <Text className="feature-desc">方便快捷下载</Text>
        </View>
        <View className="feature-item">
          <Text className="feature-icon">⚡</Text>
          <Text className="feature-title">快速生成</Text>
          <Text className="feature-desc">自动抓取文章</Text>
        </View>
      </View>
    </View>
  );
}