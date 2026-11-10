/**
 * Fetch all rows for one already-authorized, already-filtered dashboard period.
 * The API's per-request max_rows cap is usually 1,000; page below that limit.
 *
 * Every caller MUST provide the tenant and period filters and deterministic
 * ordering before .range(from, to). The helper never broadens authorization.
 * It fails closed on an error, missing response or safety limit rather than
 * showing a plausible but incomplete analytics total.
 */
export const DASHBOARD_PERIOD_PAGE_SIZE = 500;
const DASHBOARD_PERIOD_MAX_PAGES = 200;

type PageError = { message: string };
type PageResult<T> = {
  data: T[] | null;
  error: PageError | null;
};

export async function fetchCompleteDashboardPeriodRows<T>(
  loadPage: (from: number, to: number) => Promise<PageResult<T>>,
): Promise<{ data: T[]; error: PageError | null }> {
  const rows: T[] = [];

  for (let page = 0; page < DASHBOARD_PERIOD_MAX_PAGES; page += 1) {
    const from = page * DASHBOARD_PERIOD_PAGE_SIZE;
    const result = await loadPage(from, from + DASHBOARD_PERIOD_PAGE_SIZE - 1);

    if (result.error) {
      return { data: [], error: result.error };
    }
    if (!Array.isArray(result.data) || result.data.length > DASHBOARD_PERIOD_PAGE_SIZE) {
      return {
        data: [],
        error: { message: "Selected-period result is incomplete or malformed." },
      };
    }

    rows.push(...result.data);
    if (result.data.length < DASHBOARD_PERIOD_PAGE_SIZE) {
      return { data: rows, error: null };
    }
  }

  return {
    data: [],
    error: { message: "Selected-period data exceeds the safe reporting limit." },
  };
}
