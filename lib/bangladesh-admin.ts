import rawAreas from "@/data/bangladesh-admin-areas.json";

export type BangladeshUnion = {
  code: string;
  id: string;
  name: string;
  bn_name: string;
  gov_url: string;
};

export type BangladeshUpazila = {
  code: string;
  id: string;
  name: string;
  bn_name: string;
  gov_url: string;
  unions: BangladeshUnion[];
};

export type BangladeshDistrict = {
  code: string;
  id: string;
  name: string;
  bn_name: string;
  gov_url: string;
  upazilas: BangladeshUpazila[];
};

export type BangladeshDivision = {
  code: string;
  id: string;
  name: string;
  bn_name: string;
  gov_url: string;
  districts: BangladeshDistrict[];
};

export const BANGLADESH_ADMIN_AREAS = rawAreas as BangladeshDivision[];

export type ResolvedBangladeshAddress = {
  division: BangladeshDivision;
  district: BangladeshDistrict;
  upazila: BangladeshUpazila;
  union: BangladeshUnion | null;
};

export function resolveBangladeshAddress(
  divisionCode: string,
  districtCode: string,
  upazilaCode: string,
  unionCode: string
): ResolvedBangladeshAddress | null {
  const division = BANGLADESH_ADMIN_AREAS.find((item) => item.code === divisionCode);
  const district = division?.districts.find((item) => item.code === districtCode);
  const upazila = district?.upazilas.find((item) => item.code === upazilaCode);
  if (!division || !district || !upazila) return null;
  if (unionCode === "not_applicable" || unionCode === "other") {
    return { division, district, upazila, union: null };
  }
  const union = upazila.unions.find((item) => item.code === unionCode);
  return union ? { division, district, upazila, union } : null;
}

export function findAddressCodesByNames(input: {
  division?: string | null;
  district?: string | null;
  upazila?: string | null;
  union?: string | null;
}) {
  const normalize = (value?: string | null) => (value ?? "").trim().toLocaleLowerCase();
  const division = BANGLADESH_ADMIN_AREAS.find((item) =>
    [item.bn_name, item.name].some((name) => normalize(name) === normalize(input.division))
  );
  const district = division?.districts.find((item) =>
    [item.bn_name, item.name].some((name) => normalize(name) === normalize(input.district))
  );
  const upazila = district?.upazilas.find((item) =>
    [item.bn_name, item.name].some((name) => normalize(name) === normalize(input.upazila))
  );
  const union = upazila?.unions.find((item) =>
    [item.bn_name, item.name].some((name) => normalize(name) === normalize(input.union))
  );
  return {
    divisionCode: division?.code ?? "",
    districtCode: district?.code ?? "",
    upazilaCode: upazila?.code ?? "",
    unionCode: union?.code ?? "",
  };
}
