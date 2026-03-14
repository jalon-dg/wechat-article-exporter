import { createActivationCode } from '~/db/license';

interface GenerateBody {
  username: string;
  password: string;
  count?: number;
}

export default defineEventHandler(async event => {
  const body = await readBody<GenerateBody>(event);

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

  const count = Math.min(Math.max(body.count || 1, 1), 50);
  const codes: Array<{ code: string; expires_at: string }> = [];

  for (let i = 0; i < count; i++) {
    const newCode = createActivationCode(managerUsername);
    codes.push({
      code: newCode.code,
      expires_at: newCode.expires_at!,
    });
  }

  return {
    success: true,
    codes,
  };
});