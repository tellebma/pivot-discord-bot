import type { Message, SendableChannels } from 'discord.js';
import { Logger, ErrorHandler, splitForDiscord } from '@/utils';
import { reviewConfig } from '@/utils/reviewConfig';
import { extractPullRequestRefs, type PullRequestRef } from '@/services/github';
import { generateReview } from '@/services/reviewService';

/**
 * Écoute les messages des canaux surveillés. Dès qu'un message contient une ou
 * plusieurs URL de Pull Request GitHub, une relecture complète est lancée pour
 * chacune, puis publiée (de préférence dans un fil de discussion).
 */
export default {
  name: 'messageCreate',
  once: false,
  async execute(message: Message): Promise<void> {
    if (message.author.bot) return;
    if (reviewConfig.channelIds.length === 0) return;
    if (!reviewConfig.channelIds.includes(message.channelId)) return;

    const refs = extractPullRequestRefs(message.content);
    if (refs.length === 0) return;

    Logger.info('Pull request(s) detected in watched channel', {
      channelId: message.channelId,
      count: refs.length,
    });

    for (const ref of refs) {
      await reviewAndReport(message, ref);
    }
  },
};

async function reviewAndReport(message: Message, ref: PullRequestRef): Promise<void> {
  const label = `${ref.owner}/${ref.repo}#${ref.number}`;

  await message.react('👀').catch(() => undefined);

  try {
    const result = await generateReview(ref);

    const header = `📋 **Relecture de [${label}](${result.metadata.htmlUrl})** — ${result.metadata.title}`;
    const chunks = splitForDiscord(`${header}\n\n${result.review}`);

    const target = await resolveTarget(message, label);
    if (!target) {
      Logger.warn('No sendable target for review output', { channelId: message.channelId });
      return;
    }

    for (const chunk of chunks) {
      await target.send(chunk);
    }

    await message.react('✅').catch(() => undefined);
  } catch (error) {
    await message.react('❌').catch(() => undefined);
    await ErrorHandler.handle(error instanceof Error ? error : new Error(String(error)), {
      action: 'pr-review',
      channelId: message.channelId,
    });
    await message
      .reply(`❌ La relecture de \`${label}\` a échoué. Consultez les logs pour plus de détails.`)
      .catch(() => undefined);
  }
}

/**
 * Résout la cible d'envoi : un fil dédié attaché au message si possible, sinon
 * le canal courant s'il est capable de recevoir des messages.
 */
async function resolveTarget(message: Message, label: string): Promise<SendableChannels | null> {
  const thread = await message
    .startThread({ name: `Review ${label}`.slice(0, 100) })
    .catch(() => null);

  if (thread) return thread;
  if (message.channel.isSendable()) return message.channel;
  return null;
}
