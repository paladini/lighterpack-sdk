// One-off bootstrap: registers a fresh LighterPack test account and confirms
// the full register -> signIn round-trip works against the real site. Prints
// the generated credentials and writes them to .env so the opt-in
// integration suite can use them.
//
// Usage: npm run verify-live-login

import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { LighterPackClient } from '../src/client.js';

function randomUsername(): string {
  return `lpsdktest${randomBytes(4).toString('hex')}`;
}

function randomPassword(): string {
  return randomBytes(24).toString('base64url');
}

async function main(): Promise<void> {
  const username = randomUsername();
  const password = randomPassword();
  const email = `${username}@example.com`;

  console.error(`Registering test account "${username}"...`);
  const registerResult = await LighterPackClient.register({ username, email, password });
  if (registerResult.username !== username) {
    throw new Error(`Expected username "${username}" back from register(), got "${registerResult.username}".`);
  }
  console.error('Register OK.');

  console.error('Confirming a fresh LighterPackClient with the same credentials also works...');
  const lp = new LighterPackClient({ username, password });
  const info = await lp.account.get();
  console.error(`signIn OK — ${info.listCount} list(s) in the fresh account.`);

  const envPath = new URL('../.env', import.meta.url);
  const envLine = [`LIGHTERPACK_USERNAME=${username}`, `LIGHTERPACK_PASSWORD=${password}`].join('\n');

  if (existsSync(envPath)) {
    const existing = readFileSync(envPath, 'utf8');
    if (existing.includes('LIGHTERPACK_USERNAME=')) {
      console.error('.env already has LIGHTERPACK_USERNAME set — leaving it untouched. Credentials printed below instead.');
      console.error(`\n${envLine}\n`);
    } else {
      writeFileSync(envPath, `${existing.trimEnd()}\n${envLine}\n`);
      console.error(`Appended credentials to ${envPath.pathname}`);
    }
  } else {
    writeFileSync(envPath, `${envLine}\n`);
    console.error(`Wrote credentials to ${envPath.pathname}`);
  }

  console.error('\nDone. This test account can be used for the opt-in integration suite (RUN_INTEGRATION=1).');
}

main().catch((err: unknown) => {
  console.error('verify-live-login failed:', err);
  process.exitCode = 1;
});
