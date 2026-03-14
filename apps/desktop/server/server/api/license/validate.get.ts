import { getActivationCode } from '~/db/license';

export default defineEventHandler(async event => {
  const query = getQuery(event);
  const deviceId = query.device_id as string;

  if (!deviceId) {
    return {
      valid: false,
      error: '缺少设备ID',
    };
  }

  // 查找绑定到该设备的激活码
  // 这里我们遍历所有激活码来查找（因为没有直接的设备ID索引）
  const db = await import('~/db/license').then(m => m.db);
  const stmt = db.prepare(`
    SELECT * FROM activation_codes
    WHERE device_id = ? AND status = 'used'
  `);
  const activationCode = stmt.get(deviceId) as any;

  if (!activationCode) {
    return {
      valid: false,
      error: '未找到激活信息',
    };
  }

  // 检查是否过期
  if (activationCode.expires_at) {
    const expiresAt = new Date(activationCode.expires_at);
    if (expiresAt < new Date()) {
      return {
        valid: false,
        error: '激活码已过期',
        expired: true,
      };
    }
  }

  // 检查是否被禁用
  if (activationCode.status === 'disabled') {
    return {
      valid: false,
      error: '激活码已禁用',
    };
  }

  // 计算剩余天数
  const expiresAt = new Date(activationCode.expires_at);
  const now = new Date();
  const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return {
    valid: true,
    expires_at: activationCode.expires_at,
    days_left: daysLeft > 0 ? daysLeft : 0,
  };
});