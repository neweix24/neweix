"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BANGLADESH_ADMIN_AREAS,
  findAddressCodesByNames,
} from "@/lib/bangladesh-admin";
import { useLanguage } from "@/components/language-provider";

type PathaoArea = {
  pathao_area_id: number;
  pathao_area_name: string;
  home_delivery_available: boolean | null;
};

type Props = {
  initialDivision?: string | null;
  initialDistrict?: string | null;
  initialUpazila?: string | null;
  initialUnion?: string | null;
  initialVillage?: string | null;
  onAddressChange?: (address: {
    divisionCode: string;
    districtCode: string;
    upazilaCode: string;
    pathaoAreaId: string;
  }) => void;
  disabled?: boolean;
};

const selectStyle = {
  display: "block",
  width: "100%",
  boxSizing: "border-box" as const,
  margin: "8px 0 16px",
  padding: "13px 14px",
  color: "var(--ink)",
  background: "var(--surface-raised)",
  border: "1px solid var(--border)",
  borderRadius: 10,
};

const UPAZILA_CODE = /^BD-D[0-9]{2}-Z[0-9]{2}-U[0-9]{3}$/;

export default function BangladeshAddressFields({
  initialDivision,
  initialDistrict,
  initialUpazila,
  initialUnion,
  initialVillage,
  onAddressChange,
  disabled = false,
}: Props) {
  const { locale, t } = useLanguage();
  const initial = useMemo(() => findAddressCodesByNames({
    division: initialDivision,
    district: initialDistrict,
    upazila: initialUpazila,
    union: initialUnion,
  }), [initialDivision, initialDistrict, initialUpazila, initialUnion]);

  const [divisionCode, setDivisionCode] = useState(initial.divisionCode);
  const [districtCode, setDistrictCode] = useState(initial.districtCode);
  const [upazilaCode, setUpazilaCode] = useState(initial.upazilaCode);
  const [unionCode, setUnionCode] = useState(initial.unionCode);
  const [unionOther, setUnionOther] = useState("");
  const [upazilaOther, setUpazilaOther] = useState(initial.upazilaCode === "other" ? initialUpazila ?? "" : "");
  const [areas, setAreas] = useState<PathaoArea[]>([]);
  const [areaLoading, setAreaLoading] = useState(false);
  const [areaError, setAreaError] = useState("");
  const [pathaoAreaId, setPathaoAreaId] = useState("");
  const onAddressChangeRef = useRef(onAddressChange);
  onAddressChangeRef.current = onAddressChange;

  const division = BANGLADESH_ADMIN_AREAS.find((item) => item.code === divisionCode);
  const districts = division?.districts ?? [];
  const district = districts.find((item) => item.code === districtCode);
  const upazilas = district?.upazilas ?? [];
  const upazila = upazilas.find((item) => item.code === upazilaCode);
  const unions = upazila?.unions ?? [];

  useEffect(() => {
    onAddressChangeRef.current?.({ divisionCode, districtCode, upazilaCode, pathaoAreaId });
  }, [divisionCode, districtCode, upazilaCode, pathaoAreaId]);

  useEffect(() => {
    let cancelled = false;
    setAreas([]);
    setPathaoAreaId("");
    setAreaError("");

    if (!districtCode || !UPAZILA_CODE.test(upazilaCode)) {
      setAreaLoading(false);
      return () => { cancelled = true; };
    }

    setAreaLoading(true);
    const params = new URLSearchParams({ district_code: districtCode, upazila_code: upazilaCode });
    fetch(`/api/delivery/areas?${params.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.success || !Array.isArray(result.areas)) {
          throw new Error(result?.error || "Could not load Pathao Areas.");
        }
        if (!cancelled) {
          setAreas(result.areas as PathaoArea[]);
          if (!result.areas.length) {
            setAreaError(locale === "bn"
              ? "এই উপজেলায় Pathao-এর যাচাইকৃত হোম ডেলিভারি Area এখনো পাওয়া যায়নি।"
              : "No verified Pathao home-delivery Areas are available for this upazila yet.");
          }
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setAreaError(error instanceof Error ? error.message : "Could not load Pathao Areas.");
      })
      .finally(() => {
        if (!cancelled) setAreaLoading(false);
      });

    return () => { cancelled = true; };
  }, [districtCode, upazilaCode, locale]);

  function changeDivision(value: string) {
    setDivisionCode(value);
    setDistrictCode("");
    setUpazilaCode("");
    setUnionCode("");
  }

  function changeDistrict(value: string) {
    setDistrictCode(value);
    setUpazilaCode("");
    setUnionCode("");
  }

  function changeUpazila(value: string) {
    setUpazilaCode(value);
    setUnionCode("");
  }

  const areaLabel = locale === "bn" ? "Pathao এরিয়া" : "Pathao Area";
  const selectAreaLabel = locale === "bn" ? "এরিয়া নির্বাচন করুন" : "Select Pathao Area";

  return (
    <section aria-labelledby="address-area-heading">
      <h2 id="address-area-heading">{t("selectDeliveryArea")}</h2>
      <p>{t("chooseDivisionDistrict")}</p>

      <label htmlFor="shipping_division_code">{t("division")} *</label>
      <select id="shipping_division_code" name="shipping_division_code" required
        value={divisionCode} onChange={(event) => changeDivision(event.target.value)}
        disabled={disabled} style={selectStyle}>
        <option value="">{t("selectDivision")}</option>
        {BANGLADESH_ADMIN_AREAS.map((item) => <option key={item.code} value={item.code}>{locale === "bn" ? item.bn_name : item.name}</option>)}
      </select>

      <label htmlFor="shipping_district_code">{t("district")} *</label>
      <select id="shipping_district_code" name="shipping_district_code" required
        value={districtCode} onChange={(event) => changeDistrict(event.target.value)}
        disabled={disabled || !divisionCode} style={selectStyle}>
        <option value="">{t("selectDistrict")}</option>
        {districts.map((item) => <option key={item.code} value={item.code}>{locale === "bn" ? item.bn_name : item.name}</option>)}
      </select>

      <label htmlFor="shipping_upazila_code">{t("upazila")} *</label>
      <select id="shipping_upazila_code" name="shipping_upazila_code" required
        value={upazilaCode} onChange={(event) => changeUpazila(event.target.value)}
        disabled={disabled || !districtCode} style={selectStyle}>
        <option value="">{t("selectUpazila")}</option>
        {upazilas.map((item) => <option key={item.code} value={item.code}>{locale === "bn" ? item.bn_name : item.name}</option>)}
        <option value="other">{t("notListedUpazila")}</option>
      </select>

      {upazilaCode === "other" && <>
        <label htmlFor="shipping_upazila_other">{t("upazilaName")} *</label>
        <input id="shipping_upazila_other" name="shipping_upazila_other" required minLength={2} maxLength={120}
          value={upazilaOther} onChange={(event) => setUpazilaOther(event.target.value)}
          disabled={disabled} style={selectStyle} placeholder={t("enterUpazila")} />
      </>}

      {UPAZILA_CODE.test(upazilaCode) && <>
        <label htmlFor="shipping_pathao_area_id">{areaLabel} *</label>
        <select id="shipping_pathao_area_id" name="shipping_pathao_area_id" required
          value={pathaoAreaId} onChange={(event) => setPathaoAreaId(event.target.value)}
          disabled={disabled || areaLoading || areas.length === 0} style={selectStyle}>
          <option value="">{areaLoading ? (locale === "bn" ? "এরিয়া লোড হচ্ছে..." : "Loading Areas...") : selectAreaLabel}</option>
          {areas.map((area) => (
            <option key={area.pathao_area_id} value={String(area.pathao_area_id)}>
              {area.pathao_area_name}
            </option>
          ))}
        </select>
        {areaError && <p role="status" style={{ marginTop: -8, color: "var(--muted)" }}>{areaError}</p>}
      </>}

      <label htmlFor="shipping_union_code">{t("unionMunicipality")} *</label>
      <select id="shipping_union_code" name="shipping_union_code" required
        value={unionCode} onChange={(event) => setUnionCode(event.target.value)}
        disabled={disabled || !upazilaCode} style={selectStyle}>
        <option value="">{t("selectUnion")}</option>
        {unions.map((item) => <option key={item.code} value={item.code}>{locale === "bn" ? item.bn_name : item.name}</option>)}
        <option value="not_applicable">{t("notApplicableUnion")}</option>
        <option value="other">{t("otherArea")}</option>
      </select>

      {unionCode === "other" && <>
        <label htmlFor="shipping_union_other">{t("unionAreaName")} *</label>
        <input id="shipping_union_other" name="shipping_union_other" required minLength={2} maxLength={120}
          value={unionOther} onChange={(event) => setUnionOther(event.target.value)}
          disabled={disabled} style={selectStyle} placeholder={t("enterArea")} />
      </>}

      <label htmlFor="shipping_village">{t("villageWard")} *</label>
      <input id="shipping_village" name="shipping_village" required minLength={2} maxLength={160}
        defaultValue={initialVillage ?? ""} disabled={disabled} style={selectStyle} placeholder={t("enterVillage")} />

      <input type="hidden" name="shipping_city" value={district ? (locale === "bn" ? district.bn_name : district.name) : ""} />
    </section>
  );
}
