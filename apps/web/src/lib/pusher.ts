import Pusher from 'pusher';

let cachedPusher: Pusher | null = null;

export function getPusher(): Pusher | null {
  if (cachedPusher) return cachedPusher;

  const appId = process.env.PUSHER_APP_ID?.trim() || '';
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY?.trim() || '';
  const secret = process.env.PUSHER_SECRET?.trim() || '';
  if (!appId || !key || !secret) {
    return null;
  }

  cachedPusher = new Pusher({
    appId,
    key,
    secret,
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER?.trim() || 'mt1',
    useTLS: true,
  });
  return cachedPusher;
}

export const pusher = {
  async trigger(
    channel: string | string[],
    event: string,
    data: unknown,
    params?: Pusher.TriggerParams,
  ): Promise<Pusher.Response | null> {
    const client = getPusher();
    if (!client) {
      return null;
    }
    return client.trigger(channel, event, data, params);
  },
};
