import { unbindDevice } from '~/db/license';

interface LogoutBody {
  device_id: string;
}

export default defineEventHandler(async event => {
  const body = await readBody<LogoutBody>(event);

  if (!body.device_id) {
    return {
      success: false,
      error: '缺少设备ID',
    };
  }

  const deviceId = body.device_id;

  // 获取客户端 IP
  const ipAddress = getRequestIP(event) || undefined;

  // 查找绑定到该设备的激活码
  const db = await import('~/db/license').then(m => m.db);
  const stmt = db.prepare(`
    SELECT * FROM activation_codes
    WHERE device_id = ? AND status = 'used'
  `);
  const activationCode = stmt.get(deviceId) as any;

  if (!activationCode) {
    return {
      success: false,
      error: '未找到激活信息',
    };
  }

  // 解绑设备
  unbindDevice(activationCode.id, ipAddress);

  return {
    success: true,
    message: '已解除设备绑定',
  };
});