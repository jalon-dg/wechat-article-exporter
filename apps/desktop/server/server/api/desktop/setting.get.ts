import { getSetting, ensureDefaultSettings } from '~/db/client-data';

export default defineEventHandler(event => {
  const query = getQuery(event);
  const deviceId = query.device_id as string;
  const key = query.key as string;
  if (!deviceId || !key) {
    throw createError({ statusCode: 400, message: '缺少 device_id 或 key' });
  }
  ensureDefaultSettings(deviceId);
  return getSetting(deviceId, key);
});
