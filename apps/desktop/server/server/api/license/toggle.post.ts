import { getActivationCodeById, updateActivationCode } from '~/db/license';

interface ToggleBody {
  id: number;
  action: 'enable' | 'disable';
  username: string;
  password: string;
}

export default defineEventHandler(async event => {
  const body = await readBody<ToggleBody>(event);

  const config = useRuntimeConfig();
  const managerUsername = config.managerUsername || 'admin';
  const managerPassword = config.managerPassword || 'admin123';

  // 验证管理员身份
  if (body.username !== managerUsername || body.password !== managerPassword) {
    return {
      success: false,
      error: '管理员账号或密码错误',
    };
  }

  if (!body.id || !body.action) {
    return {
      success: false,
      error: '缺少必要参数',
    };
  }

  const code = getActivationCodeById(body.id);
  if (!code) {
    return {
      success: false,
      error: '激活码不存在',
    };
  }

  const newStatus = body.action === 'enable' ? 'unused' : 'disabled';
  updateActivationCode(body.id, { status: newStatus });

  return {
    success: true,
    message: body.action === 'enable' ? '激活码已启用' : '激活码已禁用',
  };
});
