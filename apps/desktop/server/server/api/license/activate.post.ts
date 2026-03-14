import { bindDevice, getActivationCode } from '~/db/license';

interface ActivateBody {
  code: string;
  device_id: string;
}

export default defineEventHandler(async event => {
  const body = await readBody<ActivateBody>(event);

  if (!body.code || !body.device_id) {
    return {
      success: false,
      error: '缺少必要参数',
    };
  }

  const code = body.code.toUpperCase();
  const deviceId = body.device_id;

  // 获取客户端 IP
  const ipAddress = getRequestIP(event) || undefined;

  // 查找激活码
  const activationCode = getActivationCode(code);

  if (!activationCode) {
    return {
      success: false,
      error: '激活码不存在',
    };
  }

  // 检查是否被禁用
  if (activationCode.status === 'disabled') {
    return {
      success: false,
      error: '激活码已禁用',
    };
  }

  // 检查是否过期
  if (activationCode.expires_at) {
    const expiresAt = new Date(activationCode.expires_at);
    if (expiresAt < new Date()) {
      return {
        success: false,
        error: '激活码已过期',
      };
    }
  }

  // 如果是同一设备重复激活，直接返回成功
  if (activationCode.device_id === deviceId) {
    return {
      success: true,
      message: '激活成功',
      expires_at: activationCode.expires_at,
    };
  }

  // 新设备激活，解绑旧设备，绑定新设备
  const updated = bindDevice(activationCode.id, deviceId, ipAddress);

  if (!updated) {
    return {
      success: false,
      error: '激活失败，请稍后重试',
    };
  }

  return {
    success: true,
    message: '激活成功',
    expires_at: updated.expires_at,
  };
});