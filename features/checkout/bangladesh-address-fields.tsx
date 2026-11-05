"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BANGLADESH_ADMIN_AREAS,
  findAddressCodesByNames,
} from "@/lib/bangladesh-admin";
import { useLanguage } from "@/components/language-provider";

type Props = {
  initialDivision?: string | null;
  initialDistrict?: string | null;
  initialUpazila?: string | null;
  initialUnion?: string | null;
  initialVillage?: string | null;
  onAddressChange?: (address: { districtCode: string; upazilaCode: string }) => void;
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

  const division = BANGLADESH_ADMIN_AREAS.find((item) => item.code === divisionCode);
  const districts = division?.districts ?? [];
  const district = districts.find((item) => item.code === districtCode);
  const upazilas = district?.upazilas ?? [];
  const upazila = upazilas.find((item) => item.code === upazilaCode);
  const unions = upazila?.unions ?? [];

  useEffect(() => {
    if (districtCode && upazilaCode) {
      onAddressChange?.({ districtCode, upazilaCode });
    }
  }, [districtCode, upazilaCode, onAddressChange]);

  function changeDivision(value: string) {
    setDivisionCode(value);
    setDistrictCode("");
    setUpazilaCode("");
    setUnionCode("");
    onAddressChange?.({ districtCode: "", upazilaCode: "" });
  }

  function changeDistrict(value: string) {
    setDistrictCode(value);
    setUpazilaCode("");
    setUnionCode("");
    const selected = districts.find((item) => item.code === value);
    onAddressChange?.({ districtCode: value, upazilaCode: "" });
  }

  function changeUpazila(value: string) {
    setUpazilaCode(value);
    setUnionCode("");
    onAddressChange?.({ districtCode, upazilaCode: value });
  }

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
