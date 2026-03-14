import { saveAccount } from '~/db/client-data';

export default defineEventHandler(async event => {
  const body = await readBody<{
    device_id: string;
    nickname: string;
    fakeid: string;
    cookie: string;
    token: string;
    appmsg_token?: string;
    weixin_2021_1?: number;
  }>(event);
  const { device_id, ...account } = body;
  if (!device_id || !account.cookie || !account.token) {
    throw createError({ statusCode: 400, message: '缺少 device_id / cookie / token' });
  }
  return saveAccount(device_id, account);
});
