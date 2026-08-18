import { ensureSchema, getApiUser, getDatabase, getRuntimeEnv } from "../../../db/repository";

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  error?: { message?: string };
};

function extractText(response: OpenAIResponse) {
  if (response.output_text) return response.output_text;
  return response.output
    ?.flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && item.text)
    .map((item) => item.text)
    .join("\n") ?? "";
}

export async function POST(request: Request) {
  const user = getApiUser(request);
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });

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
    const model = runtime.OPENAI_MODEL || "gpt-5.6-terra";
    let answer: string;
    let mode: "openai" | "preview" = "preview";

    if (runtime.OPENAI_API_KEY) {
      const systemText = [
        "You are Pi Research, a precise academic research agent.",
        "Answer in " + (locale === "zh" ? "Simplified Chinese." : "English."),
        "Current isolated research space:",
        "- Name: " + space.name,
        "- Researcher: " + space.member_name,
        "- Scope: " + space.description,
        "Only use the context from this research space. Never mix interests, memory, or assumptions from other spaces.",
        "Be concise, distinguish evidence from inference, and explain why the answer matters to this research direction.",
      ].join("\n");
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + runtime.OPENAI_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          store: false,
          reasoning: { effort: "low" },
          input: [
            { role: "system", content: [{ type: "input_text", text: systemText }] },
            { role: "user", content: [{ type: "input_text", text: question }] },
          ],
        }),
      });
      const data = await response.json() as OpenAIResponse;
      if (!response.ok) throw new Error(data.error?.message || "OpenAI request failed");
      answer = extractText(data);
      if (!answer) throw new Error("OpenAI returned an empty response");
      mode = "openai";
    } else {
      answer = locale === "zh"
        ? "这是“" + space.name + "”研究空间的安全预览回答。Pi 已把问题限定在「" + space.description + "」的上下文中；配置 OpenAI API Key 后，这里会通过 Responses API 返回实时分析，并继续保持与其他研究空间隔离。"
        : "This is a safe preview answer for the “" + space.name + "” space. Pi has scoped the question to “" + space.description + "”. Once an OpenAI API key is configured, this will use the Responses API for live analysis while remaining isolated from every other research space.";
    }

    await database.prepare("INSERT INTO research_conversations (id, space_id, question, answer, locale, model) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), space.id, question, answer, locale, mode === "openai" ? model : null)
      .run();

    return Response.json({ answer, mode, model: mode === "openai" ? model : null, spaceId: space.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to ask Pi";
    return Response.json({ error: message }, { status: 500 });
  }
}
