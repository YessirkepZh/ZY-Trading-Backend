/**
 * Sets login credentials for the owner account created by migration 009.
 *
 *   OWNER_PASSWORD=... npm run setup-owner -- --email me@example.com [--telegram-id 123456789]
 *
 * The password is read from the environment so it does not end up in shell history.
 */
import { pool } from '../db/pool';
import { MIN_PASSWORD_LENGTH, setupOwner } from '../modules/auth';

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const email = readArg('email');
  const telegramIdRaw = readArg('telegram-id');
  const password = process.env['OWNER_PASSWORD'] ?? '';

  if (!email || !/^[^@\s]+@[^@\s]+$/.test(email)) {
    throw new Error('--email is required');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`OWNER_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  const telegramId = telegramIdRaw ? Number(telegramIdRaw) : null;
  if (telegramId !== null && !Number.isSafeInteger(telegramId)) {
    throw new Error('--telegram-id must be a number');
  }

  const owner = await setupOwner({ email, password, telegramId });
  console.log(`Owner #${owner.id} updated: ${owner.email}, telegram ${owner.telegramId ?? 'not linked'}`);
}

main()
  .catch((err) => {
    console.error('setup-owner failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
