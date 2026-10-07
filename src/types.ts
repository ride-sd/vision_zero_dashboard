export interface Counts {
  killed: number;
  injured: number;
}

export interface CouncilMember {
  name: string;
  photo?: string;
  /** Overrides the global call-to-action URL for this member. */
  actionUrl?: string;
}

export interface District {
  id: number;
  name: string;
  member: CouncilMember;
  pedestrians: Counts;
  cyclists: Counts;
}

export interface CityData {
  slug: string;
  city: string;
  year: number;
  /** Date (YYYY-MM-DD) of the most recent record in the source data. */
  asOf?: string;
  source?: { name: string; url: string };
  districtName: string;
  totals: { pedestrians: Counts; cyclists: Counts };
  districtDataEstimated?: boolean;
  districtDataNote?: string;
  districts: District[];
}

/** Entry in the generated public/api/cities.json */
export interface CityIndexEntry {
  slug: string;
  name: string;
  year: number;
  killed: number;
  injured: number;
}

export interface Config {
  /** City that `/` forwards to in production builds. */
  defaultCity?: string;
  cta: { label: string; url: string };
}
