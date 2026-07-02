import { config as dotenvConfig } from 'dotenv';
import type { ConfigType } from '@/types/bot';

dotenvConfig();

const requiredEnvVars = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID'] as const;

export const validateConfig = validateEnvironment;

export function validateEnvironment(): void {
  const missing = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    console.error('Missing required environment variables:');
    missing.forEach(varName => {
      console.error(`   - ${varName}`);
    });
    console.error('\nPlease check your .env file and ensure all required variables are set.');
    process.exit(1);
  }

  console.log('Environment variables validated successfully');
}

export const config: ConfigType = {
  discord: {
    token: process.env['DISCORD_TOKEN']!,
    clientId: process.env['DISCORD_CLIENT_ID']!,
  },
  bot: {
    prefix: process.env['BOT_PREFIX'] ?? '!',
    isDevelopment: process.env['NODE_ENV'] === 'development',
  },
};
