import { useState } from 'react';
import { View, Text, Empty } from '@tarojs/components';
import { List, Card } from 'vant';
import { api } from '../../utils/request';
import './orders.less';

interface OrderItem {
  orderId: string;
  bizName: string;
  status: string;
  amount: number;
  createdAt: number;
}

export default function Orders() {
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [finished, setFinished] = useState(false);

  const onLoad = async () => {
    setLoading(true);
    // 这里需要添加一个获取所有订单的接口
    // 暂时模拟一些数据
    setTimeout(() => {
      setOrders([
        {
          orderId: 'demo-001',
          bizName: '测试公众号',
          status: 'completed',
          amount: 500,
          createdAt: Date.now() - 86400000,
        },
      ]);
      setLoading(false);
      setFinished(true);
    }, 1000);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setFinished(false);
    await onLoad();
    setRefreshing(false);
  };

  const getStatusText = (status: string) => {
    const map: Record<string, string> = {
      pending: '待支付',
      paid: '已支付',
      processing: '处理中',
      completed: '已完成',
      failed: '失败',
    };
    return map[status] || status;
  };

  const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
      pending: '#ff976a',
      paid: '#1989fa',
      processing: '#1989fa',
      completed: '#07c160',
      failed: '#ee0a24',
    };
    return map[status] || '#323233';
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  const handleOrderClick = (orderId: string) => {
    Taro.navigateTo({
      url: `/pages/order/order?orderId=${orderId}&amount=500&bizName=${encodeURIComponent('测试公众号')}`,
    });
  };

  return (
    <View className="orders-page">
      <List
        loading={loading}
        finished={finished}
        finishedText="没有更多了"
        onLoad={onLoad}
        onRefresh={onRefresh}
        refreshing={refreshing}
      >
        {orders.length === 0 && !loading ? (
          <Empty description="暂无订单" />
        ) : (
          orders.map((order) => (
            <View key={order.orderId} onClick={() => handleOrderClick(order.orderId)}>
              <Card>
                <View className="order-card">
                  <View className="order-header">
                    <Text className="biz-name">{order.bizName}</Text>
                    <Text className="status" style={{ color: getStatusColor(order.status) }}>
                      {getStatusText(order.status)}
                    </Text>
                  </View>
                  <View className="order-footer">
                    <Text className="amount">¥{(order.amount / 100).toFixed(2)}</Text>
                    <Text className="date">{formatDate(order.createdAt)}</Text>
                  </View>
                </View>
              </Card>
            </View>
          ))
        )}
      </List>
    </View>
  );
}