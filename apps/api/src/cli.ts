/**
 * Small maintenance commands, meant to be run inside the container:
 *   docker compose exec rig node dist/cli.js create-owner
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { eq } from 'drizzle-orm';
import { loadConfig } from './config.js';
import { createDb, runMigrations, waitForDatabase } from './db/index.js';
import { schema } from './db/index.js';
import { findUserByEmail, revokeAllSessions } from './auth.js';
import { hashPassword } from './crypto.js';

async function ask(question: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  if (hidden) {
    // Stop the terminal echoing the password back.
    const write = (stdout as unknown as { write: (s: string) => boolean }).write.bind(stdout);
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
      if (s.includes(question)) write(s);
    };
  }
  const answer = await rl.question(question);
  rl.close();
  if (hidden) stdout.write('\n');
  return answer.trim();
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const config = loadConfig();
  const { pool, db } = createDb(config.DATABASE_URL);
  await waitForDatabase(pool);
  await runMigrations(db);

  try {
    switch (command) {
      case 'create-owner': {
        const email = (process.argv[3] ?? config.OWNER_EMAIL).trim().toLowerCase();
        const password = process.env.NEW_PASSWORD ?? (await ask(`Password for ${email}: `, true));
        if (password.length < 10) throw new Error('Use a password of at least 10 characters.');

        const existing = await findUserByEmail(db, email);
        if (existing) {
          await db
            .update(schema.users)
            .set({ passwordHash: await hashPassword(password), role: 'owner' })
            .where(eq(schema.users.id, existing.id));
          await revokeAllSessions(db, existing.id);
          console.log(`Updated the password for ${email}. Other devices have been signed out.`);
        } else {
          await db
            .insert(schema.users)
            .values({ email, passwordHash: await hashPassword(password), role: 'owner' });
          console.log(`Created the owner account ${email}.`);
        }
        break;
      }

      case 'list-users': {
        const rows = await db
          .select({ email: schema.users.email, role: schema.users.role, createdAt: schema.users.createdAt })
          .from(schema.users);
        for (const row of rows) {
          console.log(`${row.email}\t${row.role}\t${row.createdAt.toISOString()}`);
        }
        break;
      }

      case 'sign-out-all': {
        const email = (process.argv[3] ?? config.OWNER_EMAIL).trim().toLowerCase();
        const user = await findUserByEmail(db, email);
        if (!user) throw new Error(`There is no account for ${email}.`);
        await revokeAllSessions(db, user.id);
        console.log(`Signed ${email} out everywhere.`);
        break;
      }

      default:
        console.log('Commands: create-owner [email], list-users, sign-out-all [email]');
        process.exitCode = command ? 1 : 0;
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
