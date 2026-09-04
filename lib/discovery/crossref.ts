type CrossrefDate = { "date-parts"?: number[][] };

/** First publication, not a later digitization date. Missing precision uses the period's start. */
export function crossrefPublicationDate(item: {
  published?: CrossrefDate; "published-online"?: CrossrefDate; "published-print"?: CrossrefDate;
}) {
  const dates = [item.published, item["published-print"], item["published-online"]].flatMap((value) => {
    const parts = value?.["date-parts"]?.[0];
    if (!parts || !Number.isInteger(parts[0]) || parts[0] < 1000 || parts[0] > 9999) return [];
    const [year, month = 1, day = 1] = parts;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isInteger(month) || !Number.isInteger(day)
      || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return [];
    return [date.toISOString().slice(0, 10)];
  });
  return dates.sort()[0] || null;
}
