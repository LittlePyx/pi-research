import { ensureSchema, getApiUser, getDatabase } from "../../../db/repository";
import { resolveDeepSeekCredential } from "../../../lib/model-credentials";

type SpaceRow = {
  id: string;
  name: string;
  member_name: string;
  description: string;
  accent: string;
  preferred_locale: string;
  created_at: string;
};

const defaultSpaces = [
  {
    name: "Information Theory",
    memberName: "Yilin",
    description: "Gaussian extremality, rate-distortion theory, and transport converses",
    accent: "blue",
  },
  {
    name: "Applied Mathematics",
    memberName: "Ming",
    description: "Functional inequalities, stochastic localization, and optimal transport",
    accent: "umber",
  },
  {
    name: "ML Reading",
    memberName: "Sarah",
    description: "Foundation models, efficient learning, and generative compression",
    accent: "sage",
  },
];

function toSpace(row: SpaceRow) {
  return {
    id: row.id,
    name: row.name,
    memberName: row.member_name,
    description: row.description,
    accent: row.accent,
    preferredLocale: row.preferred_locale,
    createdAt: row.created_at,
  };
}

export async function GET(request: Request) {
  const user = getApiUser(request);
  if (!user) return Response.json({ error: "Anonymous workspace is not initialized" }, { status: 401 });

  try {
    const database = getDatabase();
    await ensureSchema(database);
    let result = await database
      .prepare("SELECT id, name, member_name, description, accent, preferred_locale, created_at FROM research_spaces WHERE owner_user_id = ? ORDER BY created_at ASC")
      .bind(user.userId)
      .all<SpaceRow>();

    if (!result.results.length) {
      await database.batch(defaultSpaces.map((space, index) => database
        .prepare("INSERT INTO research_spaces (id, owner_user_id, name, member_name, description, accent, preferred_locale) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), user.userId, space.name, space.memberName, space.description, space.accent, index === 0 ? "zh" : "en")));
      result = await database
        .prepare("SELECT id, name, member_name, description, accent, preferred_locale, created_at FROM research_spaces WHERE owner_user_id = ? ORDER BY created_at ASC")
        .bind(user.userId)
        .all<SpaceRow>();
    }

    const credential = resolveDeepSeekCredential(request);
    const modelConfigured = Boolean(credential.apiKey);
    return Response.json({
      spaces: result.results.map(toSpace),
      user,
      modelConfigured,
      provider: modelConfigured ? "deepseek" : null,
      model: modelConfigured ? "deepseek-v4-pro" : null,
      modelCredentialSource: credential.source,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load research spaces";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = getApiUser(request);
  if (!user) return Response.json({ error: "Anonymous workspace is not initialized" }, { status: 401 });

  try {
    const payload = await request.json() as {
      name?: string;
      memberName?: string;
      description?: string;
      preferredLocale?: string;
    };
    const name = payload.name?.trim().slice(0, 80) ?? "";
    const memberName = payload.memberName?.trim().slice(0, 80) || user.displayName;
    const description = payload.description?.trim().slice(0, 300) ?? "";
    if (!name) return Response.json({ error: "Space name is required" }, { status: 400 });

    const database = getDatabase();
    await ensureSchema(database);
    const id = crypto.randomUUID();
    const accents = ["blue", "umber", "sage", "plum"];
    const accent = accents[Math.floor(Math.random() * accents.length)];
    await database.prepare("INSERT INTO research_spaces (id, owner_user_id, name, member_name, description, accent, preferred_locale) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, user.userId, name, memberName, description, accent, payload.preferredLocale === "en" ? "en" : "zh")
      .run();

    const row = await database.prepare("SELECT id, name, member_name, description, accent, preferred_locale, created_at FROM research_spaces WHERE id = ? AND owner_user_id = ?")
      .bind(id, user.userId)
      .first<SpaceRow>();
    return Response.json({ space: row ? toSpace(row) : null }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create research space";
    const status = message.includes("UNIQUE") ? 409 : 500;
    return Response.json({ error: message }, { status });
  }
}
