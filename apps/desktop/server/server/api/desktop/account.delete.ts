import { deleteAccount } from '~/db/client-data';

export default defineEventHandler(event => {
  const deviceId = getQuery(event).device_id as string;
  if (!deviceId) {
    throw createError({ statusCode: 400, message: '缺少 device_id' });
  }
  deleteAccount(deviceId);
  return { ok: true };
});
