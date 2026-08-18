import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const researchSpaces = sqliteTable(
  "research_spaces",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    name: text("name").notNull(),
    memberName: text("member_name").notNull(),
    description: text("description").notNull().default(""),
    accent: text("accent").notNull().default("blue"),
    preferredLocale: text("preferred_locale").notNull().default("zh"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    index("idx_research_spaces_owner").on(table.ownerUserId),
    uniqueIndex("idx_research_spaces_owner_name").on(table.ownerUserId, table.name),
  ],
);

export const researchThreads = sqliteTable(
  "research_threads",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    researchQuestion: text("research_question").notNull().default(""),
    status: text("status").notNull().default("active"),
    priority: text("priority").notNull().default("medium"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [index("idx_research_threads_space").on(table.spaceId)],
);

export const paperFeedback = sqliteTable(
  "paper_feedback",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    paperId: text("paper_id").notNull(),
    feedback: text("feedback"),
    saved: integer("saved", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    uniqueIndex("idx_paper_feedback_space_paper").on(table.spaceId, table.paperId),
  ],
);

export const researchConversations = sqliteTable(
  "research_conversations",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    locale: text("locale").notNull().default("zh"),
    model: text("model"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [index("idx_research_conversations_space").on(table.spaceId, table.createdAt)],
);
