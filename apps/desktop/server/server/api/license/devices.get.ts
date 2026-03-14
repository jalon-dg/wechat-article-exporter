import { getDevices } from '~/db/license';

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

  const devices = getDevices();

  return {
    success: true,
    devices,
  };
});