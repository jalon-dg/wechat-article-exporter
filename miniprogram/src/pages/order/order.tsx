import { useState, useEffect } from 'react';
import { View, Text } from '@tarojs/components';
import { Button, Card, Progress, Toast, Divider } from 'vant';
import { api } from '../../utils/request';
import './order.less';

interface Task {
  id: string;
  type: string;
  status: string;
  progress: number;
  error: string | null;
}

export default function Order() {
  const [orderId, setOrderId] = useState('');
  const [amount, setAmount] = useState(0);
  const [bizName, setBizName] = useState('');
  const [status, setStatus] = useState('pending');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    const params = (Taro.getCurrentInstance() as any).router?.params;
    if (params) {
      setOrderId(params.orderId || '');
      setAmount(Number(params.amount) || 0);
      setBizName(decodeURIComponent(params.bizName || ''));
    }
  }, []);

  // 轮询订单状态
  useEffect(() => {
    if (!orderId) return;

    const poll = async () => {
      try {
        const result = await api.getOrderStatus(orderId);
        setStatus(result.status);
        setTasks(result.tasks);

        if (result.status === 'completed') {
          Toast.success('订单已完成！请查收邮箱');
          setPolling(false);
        } else if (result.status === 'failed') {
          Toast.fail('订单处理失败');
          setPolling(false);
        }
      } catch (e) {
        console.error(e);
      }
    };

    // 立即查询一次
    poll();

    // 每5秒轮询一次
    const timer = setInterval(poll, 5000);
    setPolling(true);

    return () => clearInterval(timer);
  }, [orderId]);

  const handlePay = async () => {
    setLoading(true);
    try {
      // 调用支付（这里需要接入真实的微信支付）
      // 模拟支付成功
      await api.paymentCallback({
        orderId,
        paymentTime: Date.now(),
      });

      Toast.success('支付成功');
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const getStatusText = (s: string) => {
    const map: Record<string, string> = {
      pending: '待支付',
      paid: '已支付',
      processing: '处理中',
      completed: '已完成',
      failed: '失败',
    };
    return map[s] || s;
  };

  const getStatusColor = (s: string) => {
    const map: Record<string, string> = {
      pending: '#ff976a',
      paid: '#1989fa',
      processing: '#1989fa',
      completed: '#07c160',
      failed: '#ee0a24',
    };
    return map[s] || '#323233';
  };

  const getTaskName = (type: string) => {
    const map: Record<string, string> = {
      fetch_articles: '抓取文章',
      generate_ebook: '生成电子书',
      send_email: '发送邮件',
    };
    return map[type] || type;
  };

  return (
    <View className="order-page">
      <Card>
        <View className="order-info">
          <View className="info-row">
            <Text className="label">公众号</Text>
            <Text className="value">{bizName}</Text>
          </View>
          <View className="info-row">
            <Text className="label">订单号</Text>
            <Text className="value">{orderId}</Text>
          </View>
          <View className="info-row">
            <Text className="label">金额</Text>
            <Text className="value price">¥{(amount / 100).toFixed(2)}</Text>
          </View>
          <View className="info-row">
            <Text className="label">状态</Text>
            <Text className="value" style={{ color: getStatusColor(status) }}>
              {getStatusText(status)}
            </Text>
          </View>
        </View>
      </Card>

      {status === 'pending' && (
        <View className="pay-section">
          <Button
            type="primary"
            block
            loading={loading}
            onClick={handlePay}
            className="pay-btn"
          >
            立即支付
          </Button>
          <Text className="pay-tip">点击支付即表示您同意我们的服务条款</Text>
        </View>
      )}

      {(status === 'paid' || status === 'processing' || status === 'completed') && (
        <View className="progress-section">
          <Text className="section-title">处理进度</Text>
          {tasks.map((task, index) => (
            <View key={task.id} className="task-item">
              <View className="task-header">
                <Text className="task-name">{getTaskName(task.type)}</Text>
                <Text
                  className="task-status"
                  style={{ color: getStatusColor(task.status) }}
                >
                  {getStatusText(task.status)}
                </Text>
              </View>
              <Progress
                percent={task.progress}
                strokeWidth={8}
                color={getStatusColor(task.status)}
                showPivot={false}
              />
              {task.error && <Text className="task-error">{task.error}</Text>}
            </View>
          ))}
        </View>
      )}

      {status === 'completed' && (
        <View className="success-section">
          <Text className="success-icon">✅</Text>
          <Text className="success-text">电子书已发送到您的邮箱</Text>
        </View>
      )}
    </View>
  );
}