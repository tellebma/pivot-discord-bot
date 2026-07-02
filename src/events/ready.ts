import type { Client } from 'discord.js';
import { Logger } from '@/utils';
import { reviewConfig } from '@/utils/reviewConfig';

export default {
  name: 'ready',
  once: true,
  execute(client: Client): void {
    Logger.info('Bot is online and ready', {
      tag: client.user?.tag,
      guilds: client.guilds.cache.size,
      watchedChannels: reviewConfig.channelIds.length,
    });

    if (reviewConfig.channelIds.length === 0) {
      Logger.warn(
        'Aucun canal de relecture configuré. Définissez PR_REVIEW_CHANNEL_ID pour activer la relecture automatique.'
      );
    }

    client.user?.setActivity('les Pull Requests 👀', { type: 3 }); // WATCHING
  },
};
