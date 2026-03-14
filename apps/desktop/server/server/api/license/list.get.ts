import { getActivationCodes } from '~/db/license';

export default defineEventHandler(async event => {
  const query = getQuery(event);
  const username = query.username as string;
  const password = query.password as string;

  const config = useRuntimeConfig();
  const managerUsername = config.managerUsername || 'admin';
  const managerPassword = config.managerPassword || 'admin123';

  // 验证管理员身份
  if (username !== managerUsername || password !== managerPassword) {
    return {
      success: false,
      error: '管理员账号或密码错误',
    };
  }

  const codes = getActivationCodes();

  // 格式化返回数据
  const result = codes.map(code => ({
    id: code.id,
    code: code.code,
    status: code.status,
    used_at: code.used_at,
    expires_at: code.expires_at,
    device_id: code.device_id,
    created_at: code.created_at,
  }));

  return {
    success: true,
    codes: result,
  };
});
