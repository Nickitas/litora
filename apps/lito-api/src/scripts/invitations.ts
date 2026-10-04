import { parseArgs } from "node:util";
import { DatabaseService } from "../infrastructure/database.service.js";
import { createInvitationCode, invitationDigest } from "../auth/invitations.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    count: { type: "string", default: "1" },
    "expires-hours": { type: "string", default: "168" },
    id: { type: "string" },
  },
});
const action = positionals[0];
if (positionals.length !== 1 || !["create", "revoke"].includes(action))
  throw new Error("Используйте invitations create [--count 1] [--expires-hours 168] или invitations revoke --id UUID");
const count = Number(values.count);
const hours = Number(values["expires-hours"]);
if (!Number.isInteger(count) || count < 1 || count > 20 || !Number.isInteger(hours) || hours < 1 || hours > 720)
  throw new Error("Количество: 1–20; срок: 1–720 часов");
if (action === "revoke" && !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(values.id ?? ""))
  throw new Error("Для отзыва укажите --id UUID приглашения");
if (action === "create" && values.id)
  throw new Error("Для выпуска приглашений --id не используется");

async function main() {
  const db = new DatabaseService();
  try {
    await db.initialize();
    if (action === "create") {
      const invitations = await db.transaction(async (client) => {
        const result = [];
        for (let index = 0; index < count; index++) {
          const code = createInvitationCode();
          const inserted = await client.query<{ id: string; expires_at: Date }>(
            `INSERT INTO registration_invitations(code_hash,expires_at)
             VALUES($1,now()+$2*interval '1 hour') RETURNING id,expires_at`,
            [invitationDigest(code), hours],
          );
          result.push({
            id: inserted.rows[0].id,
            code,
            expiresAt: inserted.rows[0].expires_at.toISOString(),
          });
        }
        return result;
      });
      // Единственный намеренный вывод исходных ключей: не направляйте его в общие логи.
      console.log(JSON.stringify({ invitations }));
    } else {
      const result = await db.query<{ id: string }>(
        `UPDATE registration_invitations SET revoked_at=clock_timestamp()
         WHERE id=$1 AND used_at IS NULL AND revoked_at IS NULL RETURNING id`,
        [values.id],
      );
      console.log(JSON.stringify({ id: values.id, revoked: result.rowCount === 1 }));
    }
  } finally {
    await db.onModuleDestroy();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Не удалось обработать приглашение");
  process.exitCode = 1;
});
