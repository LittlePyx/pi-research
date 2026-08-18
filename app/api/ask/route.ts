import { ensureSchema, getApiUser, getDatabase, getRuntimeEnv } from "../../../db/repository";

type DeepSeekResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string };
};

const DAILY_GLOBAL_LIMIT = 200;
const DAILY_WORKSPACE_LIMIT = 50;

async function usageCount(database: D1Database, scope: string, usageDate: string) {
  const row = await database
    .prepare("SELECT request_count FROM ai_usage_daily WHERE scope = ? AND usage_date = ? LIMIT 1")
    .bind(scope, usageDate)
    .first<{ request_count: number }>();
  return row?.request_count ?? 0;
}

async function recordUsage(
  database: D1Database,
  scope: string,
  usageDate: string,
  inputTokens: number,
  outputTokens: number,
) {
  await database
    .prepare(
      `INSERT INTO ai_usage_daily (id, scope, usage_date, request_count, input_tokens, output_tokens)
       VALUES (?, ?, ?, 1, ?, ?)
       ON CONFLICT(scope, usage_date) DO UPDATE SET
         request_count = request_count + 1,
         input_tokens = input_tokens + excluded.input_tokens,
         output_tokens = output_tokens + excluded.output_tokens,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(crypto.randomUUID(), scope, usageDate, inputTokens, outputTokens)
    .run();
}

export async function POST(request: Request) {
  const user = getApiUser(request);
  if (!user) return Response.json({ error: "Anonymous workspace is not initialized" }, { status: 401 });

  try {
    const payload = await request.json() as { spaceId?: string; question?: string; locale?: string };
    const spaceId = payload.spaceId?.trim() ?? "";
    const question = payload.question?.trim().slice(0, 4000) ?? "";
    const locale = payload.locale === "en" ? "en" : "zh";
    if (!spaceId || !question) return Response.json({ error: "spaceId and question are required" }, { status: 400 });

    const database = getDatabase();
    await ensureSchema(database);
    const space = await database.prepare("SELECT id, name, member_name, description FROM research_spaces WHERE id = ? AND owner_user_id = ?")
      .bind(spaceId, user.userId)
      .first<{ id: string; name: string; member_name: string; description: string }>();
    if (!space) return Response.json({ error: "Research space not found" }, { status: 404 });

    const runtime = getRuntimeEnv();
    const model = "deepseek-v4-pro";
    let answer: string;
    let mode: "deepseek" | "preview" = "preview";
    let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

    if (runtime.DEEPSEEK_API_KEY) {
      const [importedProfiles, readingRows, trackRows] = await Promise.all([
        database.prepare(
          "SELECT analysis_json FROM research_imports WHERE space_id = ? AND status = 'confirmed' ORDER BY confirmed_at DESC LIMIT 5",
        ).bind(space.id).all<{ analysis_json: string }>(),
        database.prepare(
          `SELECT takeaway_en, methods_en, questions_en, connections_en FROM paper_reading_memories
           WHERE space_id = ? AND analysis_status = 'ready' ORDER BY updated_at DESC LIMIT 12`,
        ).bind(space.id).all<{ takeaway_en: string; methods_en: string; questions_en: string; connections_en: string }>(),
        database.prepare(
          "SELECT title_en, summary_en, user_role, depth_score, interaction_score FROM research_tracks WHERE space_id = ? ORDER BY interaction_score DESC, depth_score DESC LIMIT 10",
        ).bind(space.id).all<{ title_en: string; summary_en: string; user_role: string; depth_score: number; interaction_score: number }>(),
      ]);
      const importedMemory = importedProfiles.results.map((row) => {
        try {
          const profile = JSON.parse(row.analysis_json) as { summaryEn?: string; primaryDirectionEn?: string; openQuestions?: Array<{ labelEn?: string }> };
          return [profile.primaryDirectionEn, profile.summaryEn, ...(profile.openQuestions || []).slice(0, 8).map((item) => item.labelEn)].filter(Boolean).join("; ");
        } catch {
          return "";
        }
      }).filter(Boolean).join("\n").slice(0, 5000);
      const readingMemory = readingRows.results.map((row) => [row.takeaway_en, row.methods_en, row.questions_en, row.connections_en].filter(Boolean).join("; "))
        .join("\n").slice(0, 5000);
      const routeMemory = trackRows.results.map((row) => `${row.title_en} [${row.user_role}, depth ${row.depth_score + row.interaction_score}]: ${row.summary_en}`)
        .join("\n").slice(0, 4000);
      const usageDate = new Date().toISOString().slice(0, 10);
      const workspaceScope = "workspace:" + user.userId.slice("anonymous:".length);
      const [globalCount, workspaceCount] = await Promise.all([
        usageCount(database, "global", usageDate),
        usageCount(database, workspaceScope, usageDate),
      ]);

      if (globalCount >= DAILY_GLOBAL_LIMIT) {
        return Response.json({ error: "Pi Research has reached today's shared AI budget. Please try again tomorrow." }, { status: 429 });
      }
      if (workspaceCount >= DAILY_WORKSPACE_LIMIT) {
        return Response.json({ error: "This browser workspace has reached its daily AI limit." }, { status: 429 });
      }

      const systemText = [
        "You are Pi Research, a precise academic research agent.",
        "Answer in " + (locale === "zh" ? "Simplified Chinese." : "English."),
        "Current isolated research space:",
        "- Name: " + space.name,
        "- Researcher: " + space.member_name,
        "- Scope: " + space.description,
        "- User-confirmed imported research memory: " + (importedMemory || "None yet"),
        "- Insights distilled from the researcher's own reading notes: " + (readingMemory || "None yet"),
        "- Current research routes and depth: " + (routeMemory || "None yet"),
        "Only use the context from this research space. Never mix interests, memory, or assumptions from other spaces.",
        "Be concise, distinguish evidence from inference, and explain why the answer matters to this research direction.",
      ].join("\n");

      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + runtime.DEEPSEEK_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemText },
            { role: "user", content: question },
          ],
          thinking: { type: "enabled" },
          reasoning_effort: "high",
          max_tokens: 1200,
          stream: false,
          user_id: "space-" + space.id,
        }),
      });
      const data = await response.json() as DeepSeekResponse;
      if (!response.ok) throw new Error(data.error?.message || "DeepSeek request failed");

      answer = data.choices?.[0]?.message?.content?.trim() ?? "";
      if (!answer) throw new Error("DeepSeek returned an empty response");
      usage = {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      };
      await Promise.all([
        recordUsage(database, "global", usageDate, usage.inputTokens, usage.outputTokens),
        recordUsage(database, workspaceScope, usageDate, usage.inputTokens, usage.outputTokens),
      ]);
      mode = "deepseek";
    } else {
      answer = locale === "zh"
        ? "这是“" + space.name + "”研究空间的安全预览回答。Pi 已把问题限定在「" + space.description + "」的上下文中；配置 DeepSeek API Key 后，这里会返回实时分析，并继续保持与其他研究空间隔离。"
        : "This is a safe preview answer for the “" + space.name + "” space. Pi has scoped the question to “" + space.description + "”. Once a DeepSeek API key is configured, this will return live analysis while remaining isolated from every other research space.";
    }

    await database.prepare("INSERT INTO research_conversations (id, space_id, question, answer, locale, model) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), space.id, question, answer, locale, mode === "deepseek" ? model : null)
      .run();

    return Response.json({ answer, mode, model: mode === "deepseek" ? model : null, provider: mode === "deepseek" ? "deepseek" : null, usage, spaceId: space.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to ask Pi";
    return Response.json({ error: message }, { status: 500 });
  }
}
