/** Read all pages, not just the Supabase API's first 1,000 rows. */
export async function collectMetricPages<T>(fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>, pageSize = 1000): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await fetchPage(offset, offset + pageSize - 1);
    if (page.error) throw page.error;
    rows.push(...(page.data || []));
    if (!page.data || page.data.length < pageSize) return rows;
  }
}
