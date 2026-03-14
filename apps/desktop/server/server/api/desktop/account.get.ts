import { getAccount, ensureDefaultSettings } from '~/db/client-data';

export default defineEventHandler(event => {
  const deviceId = getQuery(event).device_id as string;
  if (!deviceId) {
    throw createError({ statusCode: 400, message: '缺少 device_id' });
  }
  ensureDefaultSettings(deviceId);
  const row = getAccount(deviceId);
  if (!row) return null;
  return {
    nickname: row.nickname,
    fakeid: row.fakeid,
    cookie: row.cookie,
    token: row.token,
    appmsg_token: row.appmsg_token,
    weixin_2021_1: row.weixin_2021_1,
    updated_at: row.updated_at,
  };
});
