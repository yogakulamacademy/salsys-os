/** 
 * Readiness for geography reporting on the selected acquisition cohort.
 *
 * This measures only non-empty self-entered CRM country fields. It does NOT
 * validate country identity, infer nationality, use IP-derived geolocation,
 * or claim a geographic distribution is complete enough for a world map.
 */
export type HomeGeographyCoverage = {
  cohortLeads: number;
  countryFieldPopulated: number;
  countryFieldMissing: number;
  populatedPercent: number | null;
};

export function buildHomeGeographyCoverage(
  leads: readonly { country?: string | null }[],
): HomeGeographyCoverage {
  const cohortLeads = leads.length;
  const countryFieldPopulated = leads.reduce(
    (sum, lead) => sum + (typeof lead.country === "string" && lead.country.trim().length > 0 ? 1 : 0),
    0,
  );
  return {
    cohortLeads,
    countryFieldPopulated,
    countryFieldMissing: cohortLeads - countryFieldPopulated,
    populatedPercent: cohortLeads > 0
      ? Math.round((countryFieldPopulated / cohortLeads) * 1000) / 10
      : null,
  };
}
