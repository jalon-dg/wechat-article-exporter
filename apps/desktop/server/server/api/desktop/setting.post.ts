import { setSetting } from '~/db/client-data';

export default defineEventHandler(async event => {
  const body = await readBody<{ device_id: string; key: string; value: string }>(event);
  const { device_id, key, value } = body ?? {};
  if (!device_id || key === undefined) {
    throw createError({ statusCode: 400, message: '缺少 device_id 或 key' });
  }
  setSetting(device_id, key, String(value ?? ''));
  return { ok: true };
});
