"use client";

import { useMemo, useState } from "react";
import {
  BANGLADESH_ADMIN_AREAS,
  findAddressCodesByNames,
} from "@/lib/bangladesh-admin";

type Props = {
  initialDivision?: string | null;
  initialDistrict?: string | null;
  initialUpazila?: string | null;
  initialUnion?: string | null;
  initialVillage?: string | null;
  onDistrictChange?: (districtName: string) => void;
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
  onDistrictChange,
  disabled = false,
}: Props) {
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

  const division = BANGLADESH_ADMIN_AREAS.find((item) => item.code === divisionCode);
  const districts = division?.districts ?? [];
  const district = districts.find((item) => item.code === districtCode);
  const upazilas = district?.upazilas ?? [];
  const upazila = upazilas.find((item) => item.code === upazilaCode);
  const unions = upazila?.unions ?? [];

  function changeDivision(value: string) {
    setDivisionCode(value);
    setDistrictCode("");
    setUpazilaCode("");
    setUnionCode("");
    onDistrictChange?.("");
  }

  function changeDistrict(value: string) {
    setDistrictCode(value);
    setUpazilaCode("");
    setUnionCode("");
    const selected = districts.find((item) => item.code === value);
    onDistrictChange?.(selected?.bn_name ?? "");
  }

  function changeUpazila(value: string) {
    setUpazilaCode(value);
    setUnionCode("");
  }

  return (
    <section aria-labelledby="address-area-heading">
      <h2 id="address-area-heading">ডেলিভারির এলাকা নির্বাচন করুন</h2>
      <p>প্রথমে বিভাগ, তারপর জেলা, উপজেলা এবং ইউনিয়ন নির্বাচন করুন।</p>

      <label htmlFor="shipping_division_code">বিভাগ *</label>
      <select id="shipping_division_code" name="shipping_division_code" required
        value={divisionCode} onChange={(event) => changeDivision(event.target.value)}
        disabled={disabled} style={selectStyle}>
        <option value="">বিভাগ নির্বাচন করুন</option>
        {BANGLADESH_ADMIN_AREAS.map((item) => <option key={item.code} value={item.code}>{item.bn_name}</option>)}
      </select>

      <label htmlFor="shipping_district_code">জেলা *</label>
      <select id="shipping_district_code" name="shipping_district_code" required
        value={districtCode} onChange={(event) => changeDistrict(event.target.value)}
        disabled={disabled || !divisionCode} style={selectStyle}>
        <option value="">জেলা নির্বাচন করুন</option>
        {districts.map((item) => <option key={item.code} value={item.code}>{item.bn_name}</option>)}
      </select>

      <label htmlFor="shipping_upazila_code">উপজেলা *</label>
      <select id="shipping_upazila_code" name="shipping_upazila_code" required
        value={upazilaCode} onChange={(event) => changeUpazila(event.target.value)}
        disabled={disabled || !districtCode} style={selectStyle}>
        <option value="">উপজেলা নির্বাচন করুন</option>
        {upazilas.map((item) => <option key={item.code} value={item.code}>{item.bn_name}</option>)}
      </select>

      <label htmlFor="shipping_union_code">ইউনিয়ন / পৌরসভা / সিটি কর্পোরেশন *</label>
      <select id="shipping_union_code" name="shipping_union_code" required
        value={unionCode} onChange={(event) => setUnionCode(event.target.value)}
        disabled={disabled || !upazilaCode} style={selectStyle}>
        <option value="">ইউনিয়ন নির্বাচন করুন</option>
        {unions.map((item) => <option key={item.code} value={item.code}>{item.bn_name}</option>)}
        <option value="not_applicable">পৌরসভা / সিটি কর্পোরেশন (ইউনিয়ন প্রযোজ্য নয়)</option>
        <option value="other">তালিকায় নেই / অন্য এলাকা</option>
      </select>

      {unionCode === "other" && <>
        <label htmlFor="shipping_union_other">ইউনিয়ন / এলাকার নাম *</label>
        <input id="shipping_union_other" name="shipping_union_other" required minLength={2} maxLength={120}
          value={unionOther} onChange={(event) => setUnionOther(event.target.value)}
          disabled={disabled} style={selectStyle} placeholder="এলাকার নাম লিখুন" />
      </>}

      <label htmlFor="shipping_village">গ্রাম / ওয়ার্ড / মহল্লা *</label>
      <input id="shipping_village" name="shipping_village" required minLength={2} maxLength={160}
        defaultValue={initialVillage ?? ""} disabled={disabled} style={selectStyle} placeholder="গ্রাম, ওয়ার্ড বা মহল্লার নাম লিখুন" />

      <input type="hidden" name="shipping_city" value={district?.bn_name ?? ""} />
    </section>
  );
}
