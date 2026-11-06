"use client";

import { useEffect, useState, type FormEvent } from "react";
import Icon from "@/components/ui/icon";
import { BANGLADESH_ADMIN_AREAS } from "@/lib/bangladesh-admin";

type State = "idle" | "loading" | "success" | "error";
type LocationOption = { id: number; name: string; available?: boolean };
type PathaoMapping = {
  id: string;
  division_code: string;
  district_code: string;
  upazila_code: string;
  pathao_city_id: number;
  pathao_zone_id: number;
  pathao_city_name: string;
  pathao_zone_name: string;
  is_verified: boolean;
  is_active: boolean;
  verified_at: string | null;
  updated_at: string;
};
type SettlementImport = {
  id: string;
  settlement_reference: string | null;
  settlement_date: string | null;
  source_filename: string;
  row_count: number;
  matched_count: number;
  mismatch_count: number;
  unmatched_count: number;
  imported_at: string;
  notes: string | null;
  expected_payout_amount: number | string | null;
  actual_received_amount: number | string | null;
  payout_variance: number | string | null;
  receipt_reference: string | null;
  received_at: string | null;
  reconciliation_status: "pending" | "reconciled" | "variance";
};
type SettlementRow = {
  id: string;
  import_id: string;
  source_row_number: number;
  source_identifier: string;
  cod_amount: number | string;
  delivery_charge: number | string | null;
  discount_amount: number | string | null;
  net_payout_amount: number | string | null;
  expected_cod_amount: number | string | null;
  variance_amount: number | string | null;
  match_status: "matched" | "amount_mismatch" | "unmatched" | "duplicate";
  merchant_order_id: string | null;
};
function parseDelimitedText(input: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = input.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}
function parseMoney(value: string): number | null {
  const cleaned = value.replace(/[৳$\s,]/g, "").replace(/[()]/g, (part) => part === "(" ? "-" : "");
  if (!cleaned) return null;
  const amount = Number(cleaned);
  return Number.isFinite(amount) && amount >= 0 && amount <= 100000000
    ? Math.round(amount * 100) / 100
    : null;
}
function money(value: number | string | null | undefined): string {
  if (value == null || value === "") return "—";
  return `৳${Number(value).toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type DeliveryOperation = {
  id: string;
  consignment_id: string;
  operation_type: "reverse_pickup" | "return" | "exchange" | "partial_delivery";
  operation_status: "requested" | "in_progress" | "completed" | "failed" | "recorded";
  related_consignment_id: string | null;
  notes: string | null;
  created_at: string;
};

type CoverageDistrictResult = {
  divisionName: string;
  districtCode: string;
  districtName: string;
  status: string;
  pathaoCityName: string | null;
  totalUpazilas: number;
  matchedUpazilas: number;
  skippedUpazilas: string[];
};

type Shipment = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string | null;
  shipping_city: string | null;
  total: number | string;
  delivery_status: string | null;
  delivery_consignment_id: string | null;
  delivery_tracking_code: string | null;
  delivery_booked_at: string | null;
  created_at: string;
};

function extractOptions(payload: unknown, idKeys: string[], nameKeys: string[]): LocationOption[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const data = root.data && typeof root.data === "object" ? root.data as Record<string, unknown> : {};
  const rows = Array.isArray(data.data) ? data.data : Array.isArray(root.data) ? root.data : Array.isArray(root.locations) ? root.locations : [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const item = row as Record<string, unknown>;
    const rawId = idKeys.map((key) => item[key]).find((value) => value !== undefined);
    const rawName = nameKeys.map((key) => item[key]).find((value) => typeof value === "string");
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1 || typeof rawName !== "string") return [];
    return [{ id, name: rawName, available: typeof item.home_delivery_available === "boolean" ? item.home_delivery_available : undefined }];
  });
}

export default function PathaoPanel() {
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("Pathao API has not been tested yet.");
  const [environment, setEnvironment] = useState("");
  const [stores, setStores] = useState<unknown>(null);
  const [cities, setCities] = useState<LocationOption[]>([]);
  const [zones, setZones] = useState<LocationOption[]>([]);
  const [areas, setAreas] = useState<LocationOption[]>([]);
  const [storeId, setStoreId] = useState("");
  const [cityId, setCityId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [itemType, setItemType] = useState("2");
  const [deliveryType, setDeliveryType] = useState("48");
  const [weight, setWeight] = useState("0.5");
  const [quote, setQuote] = useState<unknown>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [consignmentId, setConsignmentId] = useState("");
  const [tracking, setTracking] = useState<unknown>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [deliveryOperations, setDeliveryOperations] = useState<DeliveryOperation[]>([]);
  const [operationType, setOperationType] = useState<DeliveryOperation["operation_type"]>("reverse_pickup");
  const [operationStatus, setOperationStatus] = useState<DeliveryOperation["operation_status"]>("recorded");
  const [relatedConsignmentId, setRelatedConsignmentId] = useState("");
  const [operationNotes, setOperationNotes] = useState("");
  const [operationBusy, setOperationBusy] = useState(false);
  const [operationMessage, setOperationMessage] = useState("");
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [shipmentsLoading, setShipmentsLoading] = useState(false);
  const [settlementImports, setSettlementImports] = useState<SettlementImport[]>([]);
  const [settlementRows, setSettlementRows] = useState<SettlementRow[]>([]);
  const [selectedImportId, setSelectedImportId] = useState("");
  const [settlementFileName, setSettlementFileName] = useState("");
  const [settlementHeaders, setSettlementHeaders] = useState<string[]>([]);
  const [settlementCsvRows, setSettlementCsvRows] = useState<string[][]>([]);
  const [identifierColumn, setIdentifierColumn] = useState("");
  const [codColumn, setCodColumn] = useState("");
  const [chargeColumn, setChargeColumn] = useState("");
  const [discountColumn, setDiscountColumn] = useState("");
  const [payoutColumn, setPayoutColumn] = useState("");
  const [settlementReference, setSettlementReference] = useState("");
  const [settlementDate, setSettlementDate] = useState("");
  const [settlementNotes, setSettlementNotes] = useState("");
  const [settlementBusy, setSettlementBusy] = useState(false);
  const [settlementMessage, setSettlementMessage] = useState("");
  const [payoutReceivedAmount, setPayoutReceivedAmount] = useState("");
  const [payoutReceiptReference, setPayoutReceiptReference] = useState("");
  const [payoutReceiptBusy, setPayoutReceiptBusy] = useState(false);
  const [mappings, setMappings] = useState<PathaoMapping[]>([]);
  const [mappingsLoading, setMappingsLoading] = useState(false);
  const [mappingSaving, setMappingSaving] = useState(false);
  const [mappingMessage, setMappingMessage] = useState("");
  const [mappingDivisionCode, setMappingDivisionCode] = useState("");
  const [mappingDistrictCode, setMappingDistrictCode] = useState("");
  const [mappingUpazilaCode, setMappingUpazilaCode] = useState("");
  const [mappingCityId, setMappingCityId] = useState("");
  const [mappingZoneId, setMappingZoneId] = useState("");
  const [mappingZones, setMappingZones] = useState<LocationOption[]>([]);
  const [mappingZonesLoading, setMappingZonesLoading] = useState(false);
  const [mappingAutoRunning, setMappingAutoRunning] = useState(false);
  const [coverageSyncRunning, setCoverageSyncRunning] = useState(false);
  const [coverageSyncResults, setCoverageSyncResults] = useState<CoverageDistrictResult[]>([]);
  const [areaSyncRunning, setAreaSyncRunning] = useState(false);
  const [areaSyncMessage, setAreaSyncMessage] = useState("");
  const [areaSyncFailures, setAreaSyncFailures] = useState<Array<{ zoneId: number; error: string }>>([]);


  async function getJson(url: string) {
    const response = await fetch(url, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Pathao API request failed.");
    return result;
  }

  async function run(action: "status" | "stores" | "cities") {
    setState("loading");
    setMessage("Connecting to the Pathao API...");
    try {
      const result = await getJson(`/api/admin/pathao?action=${action}`);
      if (action === "status") {
        setEnvironment(result.environment || "");
        setMessage("Pathao credentials were found and authentication succeeded.");
      } else if (action === "stores") {
        setStores(result.stores);
        setMessage("Pathao store list retrieved successfully. Enter your pickup store ID below.");
      } else {
        setCities(extractOptions(result.cities, ["city_id", "cityId", "id"], ["city_name", "cityName", "name"]));
        setMessage("Pathao city list retrieved successfully.");
      }
      setState("success");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Pathao connection failed.");
    }
  }

  async function loadZones(nextCityId: string) {
    setCityId(nextCityId);
    setZoneId("");
    setAreaId("");
    setZones([]);
    setAreas([]);
    if (!nextCityId) return;
    try {
      const result = await getJson(`/api/admin/pathao?action=zones&cityId=${encodeURIComponent(nextCityId)}`);
      setZones(extractOptions(result.locations, ["zone_id", "zoneId", "id"], ["zone_name", "zoneName", "name"]));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load Pathao zones.");
      setState("error");
    }
  }

  async function loadAreas(nextZoneId: string) {
    setZoneId(nextZoneId);
    setAreaId("");
    setAreas([]);
    if (!nextZoneId) return;
    try {
      const result = await getJson(`/api/admin/pathao?action=areas&zoneId=${encodeURIComponent(nextZoneId)}`);
      setAreas(extractOptions(result.locations, ["area_id", "areaId", "id"], ["area_name", "areaName", "name"]));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load Pathao areas.");
      setState("error");
    }
  }



  async function loadShipments() {
    setShipmentsLoading(true);
    try {
      const result = await getJson("/api/admin/pathao?action=shipments");
      setShipments(Array.isArray(result.shipments) ? result.shipments as Shipment[] : []);
      setMessage("Recent Pathao shipments loaded.");
      setState("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load Pathao shipments.");
      setState("error");
    } finally {
      setShipmentsLoading(false);
    }
  }

  async function loadSettlementHistory(importId?: string) {
    setSettlementBusy(true);
    setSettlementMessage("");
    try {
      const query = importId ? `&importId=${encodeURIComponent(importId)}` : "";
      const result = await getJson(`/api/admin/pathao?action=settlement_imports${query}`);
      const imports = Array.isArray(result.imports) ? result.imports as SettlementImport[] : [];
      const rows = Array.isArray(result.rows) ? result.rows as SettlementRow[] : [];
      setSettlementImports(imports);
      setSettlementRows(rows);
      setSelectedImportId(typeof result.selectedImportId === "string" ? result.selectedImportId : "");
      setSettlementMessage("Settlement import history loaded.");
    } catch (error) {
      setSettlementMessage(error instanceof Error ? error.message : "Could not load settlement history.");
    } finally {
      setSettlementBusy(false);
    }
  }

  async function readSettlementFile(file: File | undefined) {
    setSettlementMessage("");
    setSettlementFileName("");
    setSettlementHeaders([]);
    setSettlementCsvRows([]);
    if (!file) return;
    if (file.size > 1_000_000) {
      setSettlementMessage("CSV file must be 1 MB or smaller. Split large reports into separate imports.");
      return;
    }
    try {
      const source = await file.text();
      const firstLine = source.split(/\r?\n/, 1)[0] || "";
      const delimiter = [",", ";", "\t"].sort((a, b) =>
        firstLine.split(b).length - firstLine.split(a).length
      )[0];
      const parsed = parseDelimitedText(source, delimiter);
      if (parsed.length < 2) throw new Error("CSV needs a header and at least one data row.");
      const headers = parsed[0].map((value, index) => value.trim() || `Column ${index + 1}`);
      const dataRows = parsed.slice(1).filter((row) => row.some((value) => value.trim() !== ""));
      if (headers.length < 2 || dataRows.length > 1000) {
        throw new Error("CSV must have at least two columns and no more than 1,000 data rows.");
      }
      const normalized = headers.map((value) => value.toLowerCase().replace(/[^a-z0-9]/g, ""));
      const findColumn = (candidates: string[]) => {
        const index = normalized.findIndex((header) => candidates.some((candidate) => header.includes(candidate)));
        return index >= 0 ? String(index) : "";
      };
      setSettlementFileName(file.name);
      setSettlementHeaders(headers);
      setSettlementCsvRows(dataRows.map((row) => headers.map((_, index) => row[index] ?? "")));
      setIdentifierColumn(findColumn(["consignmentid", "consignment", "orderid", "merchantorderid"]));
      setCodColumn(findColumn(["codamount", "collectableamount", "cod", "amounttocollect"]));
      setChargeColumn(findColumn(["deliverycharge", "deliveryfee", "charge"]));
      setDiscountColumn(findColumn(["discount"]));
      setPayoutColumn(findColumn(["netpayout", "paidamount", "settlementamount", "payout"]));
      setSettlementMessage(`Loaded ${dataRows.length} rows. Confirm the column mapping before importing.`);
    } catch (error) {
      setSettlementMessage(error instanceof Error ? error.message : "Could not read CSV file.");
    }
  }

  async function importSettlementReport() {
    const identifierIndex = Number(identifierColumn);
    const codIndex = Number(codColumn);
    const optionalIndex = (value: string) => value === "" ? -1 : Number(value);
    const chargeIndex = optionalIndex(chargeColumn);
    const discountIndex = optionalIndex(discountColumn);
    const payoutIndex = optionalIndex(payoutColumn);
    const selectedColumns = [identifierIndex, codIndex, chargeIndex, discountIndex, payoutIndex].filter((index) => index >= 0);
    if (!settlementFileName || !Number.isInteger(identifierIndex) || !Number.isInteger(codIndex) ||
        identifierColumn === "" || codColumn === "" || new Set(selectedColumns).size !== selectedColumns.length) {
      setSettlementMessage("Choose a different column for each mapped field before importing.");
      return;
    }
    const rows = settlementCsvRows.map((row) => ({
      identifier: (row[identifierIndex] || "").trim(),
      codAmount: parseMoney(row[codIndex] || ""),
      deliveryCharge: chargeIndex >= 0 ? parseMoney(row[chargeIndex] || "") : null,
      discountAmount: discountIndex >= 0 ? parseMoney(row[discountIndex] || "") : null,
      netPayoutAmount: payoutIndex >= 0 ? parseMoney(row[payoutIndex] || "") : null,
    }));
    const invalidRow = rows.findIndex((row, index) => {
      const source = settlementCsvRows[index];
      return !row.identifier || row.codAmount === null ||
        (chargeIndex >= 0 && Boolean(source[chargeIndex]?.trim()) && row.deliveryCharge === null) ||
        (discountIndex >= 0 && Boolean(source[discountIndex]?.trim()) && row.discountAmount === null) ||
        (payoutIndex >= 0 && Boolean(source[payoutIndex]?.trim()) && row.netPayoutAmount === null);
    });
    if (invalidRow >= 0) {
      setSettlementMessage(`Row ${invalidRow + 2} has a missing identifier or invalid mapped amount. Correct the CSV or column mapping.`);
      return;
    }
    setSettlementBusy(true);
    setSettlementMessage("");
    try {
      const response = await fetch("/api/admin/pathao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          action: "import_settlement",
          sourceFilename: settlementFileName,
          settlementReference: settlementReference.trim() || undefined,
          settlementDate: settlementDate || undefined,
          notes: settlementNotes.trim() || undefined,
          rows,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Settlement import failed.");
      setSettlementMessage(`Imported ${result.rowCount} rows: ${result.matchedCount} matched, ${result.mismatchCount} amount mismatches, ${result.unmatchedCount} unmatched/duplicate.`);
      setSettlementFileName("");
      setSettlementHeaders([]);
      setSettlementCsvRows([]);
      setSettlementReference("");
      setSettlementDate("");
      setSettlementNotes("");
      await loadSettlementHistory(result.importId);
    } catch (error) {
      setSettlementMessage(error instanceof Error ? error.message : "Settlement import failed.");
    } finally {
      setSettlementBusy(false);
    }
  }

  async function recordPayoutReceipt(importId: string) {
    const amount = Number(payoutReceivedAmount);
    if (!Number.isFinite(amount) || amount < 0 || amount > 100000000 ||
        payoutReceiptReference.trim().length < 3 || payoutReceiptReference.trim().length > 120) {
      setSettlementMessage("Enter the actual bank/MFS amount and a valid transaction reference.");
      return;
    }
    setPayoutReceiptBusy(true);
    setSettlementMessage("");
    try {
      const response = await fetch("/api/admin/pathao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          action: "record_payout_receipt",
          importId,
          actualReceivedAmount: Math.round(amount * 100) / 100,
          receiptReference: payoutReceiptReference.trim(),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not record payout receipt.");
      setPayoutReceivedAmount("");
      setPayoutReceiptReference("");
      await loadSettlementHistory(importId);
      setSettlementMessage(result.report?.reconciliation_status === "reconciled"
        ? "Payout receipt recorded. The bank/MFS amount matches the imported Pathao net payout."
        : "Payout receipt recorded with a variance. Review the difference before closing the report.");
    } catch (error) {
      setSettlementMessage(error instanceof Error ? error.message : "Could not record payout receipt.");
    } finally {
      setPayoutReceiptBusy(false);
    }
  }

  async function trackShipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTrackingLoading(true);
    setTracking(null);
    try {
      const result = await getJson(`/api/admin/pathao?action=track&consignmentId=${encodeURIComponent(consignmentId.trim())}`);
      setTracking(result);
      await loadDeliveryOperations(consignmentId.trim());
      setMessage(result.synced
        ? "Pathao status retrieved and NEWEIX order status synchronized."
        : "Pathao status retrieved. No local status change was needed.");
      setState("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not retrieve Pathao shipment status.");
      setState("error");
    } finally {
      setTrackingLoading(false);
    }
  }

  async function loadDeliveryOperations(value: string) {
    if (!/^[A-Za-z0-9-]{3,80}$/.test(value)) {
      setDeliveryOperations([]);
      return;
    }
    try {
      const result = await getJson(`/api/admin/pathao?action=delivery_operations&consignmentId=${encodeURIComponent(value)}`);
      setDeliveryOperations(Array.isArray(result.operations) ? result.operations as DeliveryOperation[] : []);
    } catch {
      setDeliveryOperations([]);
    }
  }

  async function recordDeliveryOperation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^[A-Za-z0-9-]{3,80}$/.test(consignmentId.trim())) {
      setOperationMessage("Enter and track a valid Pathao Consignment ID first.");
      return;
    }
    setOperationBusy(true);
    setOperationMessage("");
    try {
      const response = await fetch("/api/admin/pathao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          action: "record_delivery_operation",
          consignmentId: consignmentId.trim(),
          operationType,
          operationStatus,
          relatedConsignmentId: relatedConsignmentId.trim() || null,
          notes: operationNotes.trim(),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not record Pathao operation.");
      setOperationNotes("");
      setRelatedConsignmentId("");
      await loadDeliveryOperations(consignmentId.trim());
      setOperationMessage("Manual Pathao operation recorded in the NEWEIX audit history.");
    } catch (error) {
      setOperationMessage(error instanceof Error ? error.message : "Could not record Pathao operation.");
    } finally {
      setOperationBusy(false);
    }
  }

  const selectedMappingDivision = BANGLADESH_ADMIN_AREAS.find((item) => item.code === mappingDivisionCode);
  const selectedMappingDistrict = selectedMappingDivision?.districts.find((item) => item.code === mappingDistrictCode);
  const selectedMappingUpazila = selectedMappingDistrict?.upazilas.find((item) => item.code === mappingUpazilaCode);

  async function loadLocationMappings() {
    setMappingsLoading(true);
    setMappingMessage("");
    try {
      const result = await getJson("/api/admin/pathao?action=location_mappings");
      setMappings(Array.isArray(result.mappings) ? result.mappings as PathaoMapping[] : []);
      setMappingMessage("Verified delivery-area mappings loaded.");
    } catch (error) {
      setMappingMessage(error instanceof Error ? error.message : "Could not load delivery-area mappings.");
    } finally {
      setMappingsLoading(false);
    }
  }

  async function loadMappingZones(nextCityId: string) {
    setMappingCityId(nextCityId);
    setMappingZoneId("");
    setMappingZones([]);
    if (!nextCityId) return;
    setMappingZonesLoading(true);
    try {
      const result = await getJson(`/api/admin/pathao?action=zones&cityId=${encodeURIComponent(nextCityId)}`);
      setMappingZones(extractOptions(result.locations, ["zone_id", "zoneId", "id"], ["zone_name", "zoneName", "name"]));
    } catch (error) {
      setMappingMessage(error instanceof Error ? error.message : "Could not load Pathao zones.");
    } finally {
      setMappingZonesLoading(false);
    }
  }

  async function autoMapSelectedDistrict() {
    if (!mappingDivisionCode || !mappingDistrictCode || !mappingCityId) {
      setMappingMessage("Select a Bangladesh division, district, and Pathao city first.");
      return;
    }
    setMappingAutoRunning(true);
    setMappingMessage("Checking exact upazila names against the selected live Pathao city zones...");
    try {
      const response = await fetch("/api/admin/pathao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          action: "auto_map_district",
          divisionCode: mappingDivisionCode,
          districtCode: mappingDistrictCode,
          pathaoCityId: Number(mappingCityId),
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Automatic Pathao location mapping failed.");
      await loadLocationMappings();
      setMappingMessage(
        result.matchedCount > 0
          ? `Automatically verified and saved ${result.matchedCount} exact match(es) for ${selectedMappingDistrict?.name ?? "this district"}. ${result.skippedCount} area(s) were left untouched because no unique exact match was found.`
          : result.message || "No exact matches found. No mapping was saved."
      );
    } catch (error) {
      setMappingMessage(error instanceof Error ? error.message : "Automatic Pathao location mapping failed.");
    } finally {
      setMappingAutoRunning(false);
    }
  }


  async function autoMapAllDistricts() {
    setCoverageSyncRunning(true);
    setCoverageSyncResults([]);
    setMappingMessage("Reading the live Pathao city and zone catalog. Each division will be processed independently; a temporary failure will not stop the remaining districts.");
    const accumulated: CoverageDistrictResult[] = [];
    let mappedUpazilas = 0;
    let failedDivisions = 0;

    try {
      for (const division of BANGLADESH_ADMIN_AREAS) {
        let result: { error?: string; districts?: Array<Omit<CoverageDistrictResult, "divisionName">>; matchedUpazilaCount?: number } | null = null;
        let requestError = "";

        // A browser/network interruption previously stopped the entire 64-district
        // scan after the last successful division. Retry transient failures and
        // continue with the next division even if one division remains unavailable.
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            const response = await fetch("/api/admin/pathao", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              cache: "no-store",
              body: JSON.stringify({ action: "auto_map_division", divisionCode: division.code }),
            });
            result = await response.json().catch(() => null);
            if (response.ok) {
              requestError = "";
              break;
            }
            requestError = typeof result?.error === "string"
              ? result.error
              : `Pathao sync returned HTTP ${response.status}.`;
            if (response.status < 500 || attempt === 3) break;
          } catch (error) {
            requestError = error instanceof Error ? error.message : "Network request failed.";
            if (attempt === 3) break;
          }
          await new Promise((resolve) => window.setTimeout(resolve, attempt * 1200));
        }

        if (requestError) {
          failedDivisions += 1;
          for (const district of division.districts) {
            accumulated.push({
              divisionName: division.name,
              districtCode: district.code,
              districtName: district.name,
              status: "sync_error",
              pathaoCityName: null,
              totalUpazilas: district.upazilas.length,
              matchedUpazilas: 0,
              skippedUpazilas: district.upazilas.map((item) => item.name),
            });
          }
        } else {
          const rows = Array.isArray(result?.districts) ? result.districts : [];
          for (const row of rows) {
            accumulated.push({ ...row, divisionName: division.name } as CoverageDistrictResult);
          }
          mappedUpazilas += Number(result?.matchedUpazilaCount ?? 0);
        }

        setCoverageSyncResults([...accumulated]);
        setMappingMessage(
          `Checked ${accumulated.length}/64 districts. ${mappedUpazilas} exact upazila mappings saved. ${failedDivisions} division(s) had temporary/API errors.`,
        );
      }

      await loadLocationMappings();
      const fullyMapped = accumulated.filter((item) => item.status === "fully_mapped").length;
      const partiallyMapped = accumulated.filter((item) => item.status === "partially_mapped").length;
      const unmapped = accumulated.filter((item) =>
        !["fully_mapped", "partially_mapped", "sync_error"].includes(item.status)
      ).length;
      const syncErrors = accumulated.filter((item) => item.status === "sync_error").length;
      setMappingMessage(
        `Coverage scan finished: ${accumulated.length}/64 districts checked; ${fullyMapped} fully mapped, ${partiallyMapped} partially mapped, ${unmapped} need manual review, ${syncErrors} had API/network errors. ${mappedUpazilas} verified upazila mappings saved. Run Sync again to retry failed divisions; existing verified mappings are safely updated.`,
      );
    } catch (error) {
      setMappingMessage(error instanceof Error ? error.message : "Pathao 64-district coverage scan failed.");
    } finally {
      setCoverageSyncRunning(false);
    }
  }

  async function syncAreaCatalog() {
    setAreaSyncRunning(true);
    setAreaSyncFailures([]);
    setAreaSyncMessage("Fetching live Pathao Areas for all verified mapped zones...");
    try {
      const response = await fetch("/api/admin/pathao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ action: "sync_area_catalog" }),
      });
      const result = await response.json().catch(() => null) as {
        error?: string;
        message?: string;
        areaCount?: number;
        syncedZoneCount?: number;
        mappedZoneCount?: number;
        failedZoneCount?: number;
        failedZones?: Array<{ zoneId: number; error: string }>;
      } | null;
      setAreaSyncFailures(result?.failedZones ?? []);
      if (!response.ok) {
        throw new Error(result?.error || result?.message || "Pathao Area catalog sync failed.");
      }
      setAreaSyncMessage(
        result?.message ||
        `Saved ${result?.areaCount ?? 0} Pathao Areas across ${result?.syncedZoneCount ?? 0}/${result?.mappedZoneCount ?? 0} zones. ${result?.failedZoneCount ?? 0} zones need retry.`,
      );
    } catch (error) {
      setAreaSyncMessage(error instanceof Error ? error.message : "Pathao Area catalog sync failed.");
    } finally {
      setAreaSyncRunning(false);
    }
  }

  async function saveLocationMapping(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mappingDivisionCode || !mappingDistrictCode || !mappingUpazilaCode || !mappingCityId || !mappingZoneId) {
      setMappingMessage("Select the Bangladesh area and its matching Pathao city and zone.");
      return;
    }
    setMappingSaving(true);
    setMappingMessage("");
    try {
      const response = await fetch("/api/admin/pathao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          action: "save_location_mapping",
          divisionCode: mappingDivisionCode,
          districtCode: mappingDistrictCode,
          upazilaCode: mappingUpazilaCode,
          pathaoCityId: Number(mappingCityId),
          pathaoZoneId: Number(mappingZoneId),
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Could not verify this Pathao area mapping.");
      await loadLocationMappings();
      setMappingMessage("Pathao city/zone mapping verified and saved. Checkout can now quote this upazila.");
    } catch (error) {
      setMappingMessage(error instanceof Error ? error.message : "Could not save the Pathao mapping.");
    } finally {
      setMappingSaving(false);
    }
  }

  async function calculatePrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuoteLoading(true);
    setQuote(null);
    try {
      const response = await fetch("/api/admin/pathao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          action: "calculate_price",
          storeId: Number(storeId),
          itemType: Number(itemType),
          deliveryType: Number(deliveryType),
          itemWeightKg: Number(weight),
          recipientCity: cityId ? Number(cityId) : undefined,
          recipientZone: zoneId ? Number(zoneId) : undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Pathao price calculation failed.");
      setQuote(result.quote);
      setMessage("Live delivery charge received from Pathao.");
      setState("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Pathao price calculation failed.");
      setState("error");
    } finally {
      setQuoteLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let cancelled = false;
    const syncKey = "neweix:pathao-coverage-sync:v2";

    async function ensureCoverageMappings() {
      try {
        const result = await getJson("/api/admin/pathao?action=location_mappings");
        if (cancelled) return;
        const activeDistricts = new Set(
          (Array.isArray(result.mappings) ? result.mappings : [])
            .filter((mapping: PathaoMapping) => mapping.is_verified && mapping.is_active)
            .map((mapping: PathaoMapping) => mapping.district_code),
        );
        if (activeDistricts.size >= 64) return;
        if (window.sessionStorage.getItem(syncKey) === "attempted") return;

        // Continue the nationwide scan when only some districts are mapped.
        // The live matcher saves unique exact Pathao City/Zone matches only;
        // ambiguous or unsupported districts remain visible for manual review.
        window.sessionStorage.setItem(syncKey, "attempted");
        await autoMapAllDistricts();
      } catch {
        // Keep the manual sync control available; do not block the admin panel.
      }
    }

    void ensureCoverageMappings();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Pathao Courier Management</h2>
          <p className="mt-1 text-sm text-gray-600">Verify the merchant connection, inspect pickup stores and calculate live delivery charges.</p>
        </div>
        <span className="rounded-full border px-3 py-1 text-xs font-medium">
          {state === "loading" || quoteLoading ? "Testing" : state === "success" ? "Connected" : state === "error" ? "Action required" : "Not Tested"}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => void run("status")} disabled={state === "loading"} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Icon name="shield" size={16} /> Check Credentials</button>
        <button type="button" onClick={() => void run("stores")} disabled={state === "loading"} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50"><Icon name="grid" size={16} /> Fetch Store List</button>
        <button type="button" onClick={() => void run("cities")} disabled={state === "loading"} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50"><Icon name="map-pin" size={16} /> Fetch Cities</button>
      </div>
      <p role="status" className={`mt-3 text-sm ${state === "error" ? "text-red-700" : state === "success" ? "text-green-700" : "text-gray-600"}`}>{message}</p>
      {environment && <p className="mt-1 text-xs text-gray-500">Environment: {environment}</p>}



      <section className="mt-5 space-y-4 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Checkout Delivery Area Mapping</h3>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-gray-600">Checkout only calculates a live Pathao fee for verified Bangladesh upazila → Pathao city/zone mappings. This table starts empty after migration; save each supported upazila here. The API verifies city and zone IDs against Pathao before saving.</p>
          </div>
          <button type="button" onClick={() => void loadLocationMappings()} disabled={mappingsLoading} className="rounded-lg border bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50">{mappingsLoading ? "Loading..." : "Refresh Mappings"}</button>
        </div>
        <button
          type="button"
          onClick={() => void autoMapSelectedDistrict()}
          disabled={mappingAutoRunning || mappingSaving || !mappingDivisionCode || !mappingDistrictCode || !mappingCityId}
          className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 disabled:opacity-50"
        >
          {mappingAutoRunning ? "Matching verified Pathao zones..." : "Auto-match exact upazila names"}
        </button>
        <p className="text-xs leading-5 text-gray-600">
          Pathao officially reports home delivery across all 64 districts. This scan matches NEWEIX districts and upazilas to the live merchant API catalog; it saves only unique exact city/zone matches and leaves uncertain areas for manual review.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void autoMapAllDistricts()} disabled={coverageSyncRunning || mappingAutoRunning || mappingSaving} className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {coverageSyncRunning ? "Scanning 64 districts..." : "Sync Pathao coverage for all 64 districts"}
          </button>
          <span className="text-xs text-gray-600">Eight divisions · live City/Zone catalog · no guessed mappings</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void syncAreaCatalog()}
            disabled={areaSyncRunning || coverageSyncRunning || mappingAutoRunning || mappingSaving || mappings.length === 0}
            className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 disabled:opacity-50"
          >
            {areaSyncRunning ? "Syncing Pathao Areas..." : "Sync Pathao Area catalog"}
          </button>
          <span className="text-xs text-gray-600">Stores live Area IDs and home-delivery availability for verified zones.</span>
        </div>
        {areaSyncMessage && <p role="status" className="text-xs text-gray-700">{areaSyncMessage}</p>}
        {areaSyncFailures.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-900">Zones needing investigation ({areaSyncFailures.length})</p>
            <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-xs text-amber-900">
              {areaSyncFailures.map((failure) => (
                <li key={failure.zoneId}>Zone {failure.zoneId}: {failure.error}</li>
              ))}
            </ul>
          </div>
        )}
        {coverageSyncResults.length > 0 && (
          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="border-b bg-gray-50"><tr><th className="p-2">Division</th><th className="p-2">District</th><th className="p-2">Pathao city</th><th className="p-2">Upazila mapping</th><th className="p-2">Result</th></tr></thead>
              <tbody>{coverageSyncResults.map((item) => (
                <tr key={item.districtCode} className="border-b last:border-0">
                  <td className="p-2">{item.divisionName}</td>
                  <td className="p-2 font-medium">{item.districtName}</td>
                  <td className="p-2">{item.pathaoCityName ?? "Not matched"}</td>
                  <td className="p-2">{item.matchedUpazilas}/{item.totalUpazilas}</td>
                  <td className="p-2">{item.status === "fully_mapped" ? "Fully mapped" : item.status === "partially_mapped" ? `Partial · ${item.skippedUpazilas.length} need review` : item.status === "sync_error" ? "Sync error" : item.status === "city_not_found" ? "City not found" : item.status === "city_ambiguous" ? "Ambiguous city" : item.status === "zones_unavailable" ? "Zones unavailable" : "No exact zone match"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <p className="text-xs leading-5 text-gray-600">
          The selected-district matcher below is available for manual correction. Ambiguous or unmatched areas are skipped, never guessed.
        </p>
        <form onSubmit={saveLocationMapping} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">Bangladesh division
            <select required value={mappingDivisionCode} onChange={(event) => { setMappingDivisionCode(event.target.value); setMappingDistrictCode(""); setMappingUpazilaCode(""); }} className="mt-1 w-full rounded-lg border bg-white px-3 py-2">
              <option value="">Select division</option>
              {BANGLADESH_ADMIN_AREAS.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">District
            <select required value={mappingDistrictCode} onChange={(event) => { setMappingDistrictCode(event.target.value); setMappingUpazilaCode(""); }} disabled={!mappingDivisionCode} className="mt-1 w-full rounded-lg border bg-white px-3 py-2">
              <option value="">Select district</option>
              {(selectedMappingDivision?.districts ?? []).map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">Upazila / area
            <select required value={mappingUpazilaCode} onChange={(event) => setMappingUpazilaCode(event.target.value)} disabled={!mappingDistrictCode} className="mt-1 w-full rounded-lg border bg-white px-3 py-2">
              <option value="">Select upazila</option>
              {(selectedMappingDistrict?.upazilas ?? []).map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">Pathao city
            <select required value={mappingCityId} onChange={(event) => { setMappingCityId(event.target.value); setMappingZoneId(""); setMappingZones([]); if (event.target.value) void loadMappingZones(event.target.value); }} className="mt-1 w-full rounded-lg border bg-white px-3 py-2">
              <option value="">Fetch/select Pathao city</option>
              {cities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            {cities.length === 0 && <span className="mt-1 block text-xs text-gray-500">First select “Fetch Cities” above.</span>}
          </label>
          <label className="text-sm font-medium">Pathao zone
            <select required value={mappingZoneId} onChange={(event) => setMappingZoneId(event.target.value)} disabled={!mappingCityId || mappingZonesLoading} className="mt-1 w-full rounded-lg border bg-white px-3 py-2">
              <option value="">{mappingZonesLoading ? "Loading zones..." : "Select Pathao zone"}</option>
              {mappingZones.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <button type="submit" disabled={mappingSaving || !selectedMappingUpazila || !mappingCityId || !mappingZoneId} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2">{mappingSaving ? "Verifying & saving..." : "Verify and save area mapping"}</button>
        </form>
        {mappingMessage && <p role="status" className="text-xs text-gray-700">{mappingMessage}</p>}
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className="border-b bg-gray-50"><tr><th className="p-2">NEWEIX upazila</th><th className="p-2">Pathao city</th><th className="p-2">Pathao zone</th><th className="p-2">Status</th></tr></thead>
            <tbody>{mappings.map((item) => {
              const division = BANGLADESH_ADMIN_AREAS.find((entry) => entry.code === item.division_code);
              const district = division?.districts.find((entry) => entry.code === item.district_code);
              const upazila = district?.upazilas.find((entry) => entry.code === item.upazila_code);
              return <tr key={item.id} className="border-b last:border-0"><td className="p-2">{division?.name ?? item.division_code} / {district?.name ?? item.district_code} / {upazila?.name ?? item.upazila_code}</td><td className="p-2">{item.pathao_city_name} ({item.pathao_city_id})</td><td className="p-2">{item.pathao_zone_name} ({item.pathao_zone_id})</td><td className="p-2">{item.is_active && item.is_verified ? "Verified & active" : "Inactive / unverified"}</td></tr>;
            })}</tbody>
          </table>
          {mappings.length === 0 && <p className="p-3 text-xs text-gray-500">{mappingsLoading ? "Loading mappings..." : "No delivery-area mappings loaded. Refresh to check; add verified upazila mappings above."}</p>}
        </div>
      </section>

      <section className="mt-5 rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Recent Pathao Shipments</h3>
            <p className="mt-1 text-xs text-gray-500">Latest 50 booked consignments saved in NEWEIX.</p>
          </div>
          <button type="button" onClick={() => void loadShipments()} disabled={shipmentsLoading} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">{shipmentsLoading ? "Loading..." : "Refresh Shipments"}</button>
        </div>
        {shipments.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead><tr className="border-b text-xs text-gray-500"><th className="p-2">Order</th><th className="p-2">Customer</th><th className="p-2">Consignment</th><th className="p-2">Status</th><th className="p-2">Booked</th></tr></thead>
              <tbody>{shipments.map((shipment) => (
                <tr key={shipment.id} className="border-b last:border-0">
                  <td className="p-2"><span className="font-semibold">{shipment.order_number}</span><span className="block text-xs text-gray-500">BDT {Number(shipment.total).toLocaleString("en-BD")}</span></td>
                  <td className="p-2">{shipment.customer_name}<span className="block text-xs text-gray-500">{shipment.customer_phone || "—"}</span></td>
                  <td className="p-2"><button type="button" onClick={() => setConsignmentId(shipment.delivery_consignment_id || "")} className="font-mono text-xs text-blue-700 underline">{shipment.delivery_consignment_id || shipment.delivery_tracking_code || "—"}</button></td>
                  <td className="p-2">{shipment.delivery_status || "—"}</td>
                  <td className="p-2 text-xs text-gray-500">{shipment.delivery_booked_at ? new Date(shipment.delivery_booked_at).toLocaleString() : "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-gray-500">{shipmentsLoading ? "Loading shipment history..." : "No Pathao shipments loaded. Select Refresh Shipments to check."}</p>
        )}
      </section>

      <section className="mt-5 space-y-4 rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">COD Settlement Reconciliation</h3>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-gray-500">
              Import a CSV exported from Pathao Merchant Panel. Map the identifier and COD amount columns yourself; NEWEIX matches consignment ID or merchant order number and compares COD against the amount expected at booking. This does not mark bank payouts as received.
            </p>
          </div>
          <button type="button" onClick={() => void loadSettlementHistory()} disabled={settlementBusy} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">
            {settlementBusy ? "Loading..." : "Load Import History"}
          </button>
        </div>

        <label className="block text-sm font-medium">
          Pathao CSV report
          <input type="file" accept=".csv,text/csv,.txt,text/plain" onChange={(event) => void readSettlementFile(event.target.files?.[0])} className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm" />
        </label>
        {settlementFileName && <p className="text-xs text-gray-600">{settlementFileName} · {settlementCsvRows.length} rows loaded</p>}

        {settlementHeaders.length > 0 && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">Identifier column (Consignment ID or NEWEIX Order ID) *
                <select value={identifierColumn} onChange={(event) => setIdentifierColumn(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2">
                  <option value="">Choose column</option>{settlementHeaders.map((header, index) => <option key={index} value={index}>{header}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium">COD amount column *
                <select value={codColumn} onChange={(event) => setCodColumn(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2">
                  <option value="">Choose column</option>{settlementHeaders.map((header, index) => <option key={index} value={index}>{header}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium">Delivery charge column (optional)
                <select value={chargeColumn} onChange={(event) => setChargeColumn(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2">
                  <option value="">Not included</option>{settlementHeaders.map((header, index) => <option key={index} value={index}>{header}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium">Discount column (optional)
                <select value={discountColumn} onChange={(event) => setDiscountColumn(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2">
                  <option value="">Not included</option>{settlementHeaders.map((header, index) => <option key={index} value={index}>{header}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium">Net payout column (optional, informational)
                <select value={payoutColumn} onChange={(event) => setPayoutColumn(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2">
                  <option value="">Not included</option>{settlementHeaders.map((header, index) => <option key={index} value={index}>{header}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium">Settlement reference (recommended)
                <input maxLength={120} value={settlementReference} onChange={(event) => setSettlementReference(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="Unique Pathao statement/reference" />
              </label>
              <label className="text-sm font-medium">Settlement date (optional)
                <input type="date" value={settlementDate} onChange={(event) => setSettlementDate(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" />
              </label>
              <label className="text-sm font-medium sm:col-span-2">Notes (optional)
                <input maxLength={1000} value={settlementNotes} onChange={(event) => setSettlementNotes(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="Report period or internal note" />
              </label>
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[520px] text-left text-xs">
                <thead className="bg-gray-50"><tr>{settlementHeaders.slice(0, 6).map((header, index) => <th key={index} className="p-2">{header}</th>)}</tr></thead>
                <tbody>{settlementCsvRows.slice(0, 3).map((row, rowIndex) => <tr key={rowIndex} className="border-t">{settlementHeaders.slice(0, 6).map((_, index) => <td key={index} className="max-w-48 truncate p-2">{row[index] || "—"}</td>)}</tr>)}</tbody>
              </table>
            </div>
            <button type="button" onClick={() => void importSettlementReport()} disabled={settlementBusy || !identifierColumn || !codColumn || settlementCsvRows.length === 0} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {settlementBusy ? "Importing..." : "Import & Reconcile CSV"}
            </button>
          </>
        )}
        {settlementMessage && <p role="status" className="text-sm text-gray-700">{settlementMessage}</p>}

        {settlementImports.length > 0 && (
          <div className="space-y-3 border-t pt-4">
            <h4 className="text-sm font-semibold">Imported Reports</h4>
            <div className="flex flex-wrap gap-2">
              {settlementImports.map((item) => (
                <button key={item.id} type="button" onClick={() => void loadSettlementHistory(item.id)} className={`rounded-lg border px-3 py-2 text-left text-xs ${selectedImportId === item.id ? "border-emerald-700 bg-emerald-50" : "border-gray-200"}`}>
                  <span className="block font-semibold">{item.settlement_reference || item.source_filename}</span>
                  <span className="block text-gray-500">{item.row_count} rows · {item.imported_at ? new Date(item.imported_at).toLocaleDateString() : "—"}</span>
                </button>
              ))}
            </div>
            {(() => {
              const selected = settlementImports.find((item) => item.id === selectedImportId) || settlementImports[0];
              const selectedRows = settlementRows.filter((row) => row.import_id === selected.id);
              return (
                <div>
                  <p className="text-xs text-gray-600">{selected.source_filename} · {selected.settlement_date || "No settlement date"}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-500">Rows</p><p className="text-lg font-bold">{selected.row_count}</p></div>
                    <div className="rounded-lg bg-emerald-50 p-3"><p className="text-xs text-gray-500">Matched</p><p className="text-lg font-bold">{selected.matched_count}</p></div>
                    <div className="rounded-lg bg-amber-50 p-3"><p className="text-xs text-gray-500">Amount mismatch</p><p className="text-lg font-bold">{selected.mismatch_count}</p></div>
                    <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-500">Unmatched / duplicate</p><p className="text-lg font-bold">{selected.unmatched_count}</p></div>
                  </div>
                  <div className="mt-3 rounded-lg border p-3">
                    <h5 className="text-sm font-semibold">Bank / MFS Payout Reconciliation</h5>
                    {selected.expected_payout_amount == null ? (
                      <p className="mt-1 text-xs text-gray-600">This report did not include a Net Payout value for every row. Import a CSV with a mapped Net Payout column to compare the expected transfer with the actual bank/MFS receipt.</p>
                    ) : selected.actual_received_amount == null ? (
                      <div className="mt-2 grid gap-3 sm:grid-cols-3">
                        <div><p className="text-xs text-gray-500">Expected net payout</p><p className="font-bold">{money(selected.expected_payout_amount)}</p></div>
                        <label className="text-sm font-medium">Actual amount received
                          <input type="number" min="0" max="100000000" step="0.01" value={payoutReceivedAmount} onChange={(event) => setPayoutReceivedAmount(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="Amount from bank/MFS" />
                        </label>
                        <label className="text-sm font-medium">Bank/MFS transaction reference
                          <input maxLength={120} value={payoutReceiptReference} onChange={(event) => setPayoutReceiptReference(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="Statement reference / Trx ID" />
                        </label>
                        <button type="button" onClick={() => void recordPayoutReceipt(selected.id)} disabled={payoutReceiptBusy || !payoutReceivedAmount || payoutReceiptReference.trim().length < 3} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-3">
                          {payoutReceiptBusy ? "Saving receipt..." : "Record & Compare Payout Receipt"}
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2 grid gap-2 sm:grid-cols-4">
                        <div><p className="text-xs text-gray-500">Expected</p><p className="font-bold">{money(selected.expected_payout_amount)}</p></div>
                        <div><p className="text-xs text-gray-500">Received</p><p className="font-bold">{money(selected.actual_received_amount)}</p></div>
                        <div><p className="text-xs text-gray-500">Difference</p><p className="font-bold">{money(selected.payout_variance)}</p></div>
                        <div><p className="text-xs text-gray-500">Status</p><p className="font-bold capitalize">{selected.reconciliation_status}</p></div>
                        <p className="text-xs text-gray-500 sm:col-span-4">Receipt reference: {selected.receipt_reference || "—"} · Recorded {selected.received_at ? new Date(selected.received_at).toLocaleString() : "—"}</p>
                      </div>
                    )}
                    <p className="mt-2 text-xs text-gray-500">This records the amount and reference entered by an authorized admin; it does not independently verify the bank/MFS account or contact Pathao Pay.</p>
                  </div>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-xs">
                      <thead className="border-b text-gray-500"><tr><th className="p-2">Source ID</th><th className="p-2">NEWEIX Order</th><th className="p-2">COD in CSV</th><th className="p-2">Expected COD</th><th className="p-2">Variance</th><th className="p-2">Net payout*</th><th className="p-2">Result</th></tr></thead>
                      <tbody>{selectedRows.map((row) => (
                        <tr key={row.id} className="border-b last:border-0">
                          <td className="p-2 font-mono">{row.source_identifier}</td><td className="p-2">{row.merchant_order_id || "—"}</td>
                          <td className="p-2">{money(row.cod_amount)}</td><td className="p-2">{money(row.expected_cod_amount)}</td>
                          <td className="p-2">{money(row.variance_amount)}</td><td className="p-2">{money(row.net_payout_amount)}</td>
                          <td className="p-2">{row.match_status.replace("_", " ")}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">* Net payout is stored only as reported in the imported CSV; it is not proof that the bank or MFS transfer was received. Variance = CSV COD amount − NEWEIX expected COD.</p>
                </div>
              );
            })()}
          </div>
        )}
      </section>

      <form onSubmit={trackShipment} className="mt-5 space-y-3 rounded-xl border border-gray-200 p-4">
        <div>
          <h3 className="font-semibold">Shipment Tracking & Status Sync</h3>
          <p className="mt-1 text-xs text-gray-500">Fetch the latest status from Pathao. NEWEIX applies only supported, valid order-state transitions.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input required minLength={3} maxLength={80} value={consignmentId} onChange={(event) => setConsignmentId(event.target.value)} className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" placeholder="Pathao Consignment ID" />
          <button type="submit" disabled={trackingLoading || !consignmentId.trim()} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{trackingLoading ? "Checking..." : "Track Shipment"}</button>
        </div>
        {tracking !== null && <pre className="max-h-64 overflow-auto rounded-lg bg-gray-50 p-3 text-xs">{JSON.stringify(tracking, null, 2)}</pre>}
      </form>

      <section className="mt-5 space-y-3 rounded-xl border border-gray-200 p-4">
        <div>
          <h3 className="font-semibold">NEWEIX Return / Exchange Operation Log</h3>
          <p className="mt-1 text-xs leading-5 text-gray-600">After completing or requesting the action in Pathao Merchant Panel, record the operation here. This is an internal audit entry only; it does not create or cancel a Pathao request.</p>
        </div>
        <form onSubmit={recordDeliveryOperation} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">Operation
            <select value={operationType} onChange={(event) => setOperationType(event.target.value as DeliveryOperation["operation_type"])} className="mt-1 w-full rounded-lg border px-3 py-2">
              <option value="reverse_pickup">Reverse Pickup</option>
              <option value="return">Return</option>
              <option value="exchange">Exchange</option>
              <option value="partial_delivery">Partial Delivery</option>
            </select>
          </label>
          <label className="text-sm font-medium">Operation status
            <select value={operationStatus} onChange={(event) => setOperationStatus(event.target.value as DeliveryOperation["operation_status"])} className="mt-1 w-full rounded-lg border px-3 py-2">
              <option value="recorded">Recorded</option>
              <option value="requested">Requested in Pathao</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
          </label>
          <label className="text-sm font-medium sm:col-span-2">Related / return / exchange Consignment ID (optional)
            <input maxLength={80} value={relatedConsignmentId} onChange={(event) => setRelatedConsignmentId(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="New return or exchange parcel ID" />
          </label>
          <label className="text-sm font-medium sm:col-span-2">Notes (optional)
            <textarea maxLength={1000} rows={3} value={operationNotes} onChange={(event) => setOperationNotes(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="Record returned item condition, accepted quantities, collection amount, or Pathao support reference." />
          </label>
          <button type="submit" disabled={operationBusy || !consignmentId.trim()} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2">
            {operationBusy ? "Recording..." : "Save Operation to Audit History"}
          </button>
        </form>
        {operationMessage && <p className="text-xs text-gray-600">{operationMessage}</p>}
        {deliveryOperations.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead className="border-b text-gray-500"><tr><th className="p-2">Operation</th><th className="p-2">Status</th><th className="p-2">Related ID</th><th className="p-2">Notes</th><th className="p-2">Recorded</th></tr></thead>
              <tbody>{deliveryOperations.map((item) => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="p-2 font-medium">{item.operation_type.replaceAll("_", " ")}</td>
                  <td className="p-2">{item.operation_status.replaceAll("_", " ")}</td>
                  <td className="p-2 font-mono">{item.related_consignment_id || "—"}</td>
                  <td className="max-w-xs whitespace-pre-wrap p-2">{item.notes || "—"}</td>
                  <td className="p-2">{new Date(item.created_at).toLocaleString()}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-gray-500">No manual Pathao operation has been recorded for this consignment yet. Track the shipment to load its history.</p>
        )}
      </section>

      <form onSubmit={calculatePrice} className="mt-5 space-y-4 rounded-xl border border-gray-200 p-4">
        <div>
          <h3 className="font-semibold">Live Delivery Charge Calculator</h3>
          <p className="mt-1 text-xs text-gray-500">The quote comes from the Pathao price-plan API; it is not a locally estimated fee.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">Pickup Store ID
            <input required inputMode="numeric" pattern="[0-9]+" value={storeId} onChange={(event) => setStoreId(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="Pathao store ID" />
          </label>
          <label className="text-sm font-medium">Parcel weight (kg)
            <input required type="number" min="0.5" max="10" step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" />
          </label>
          <label className="text-sm font-medium">Product type
            <select value={itemType} onChange={(event) => setItemType(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="2">Parcel</option><option value="1">Document</option></select>
          </label>
          <label className="text-sm font-medium">Delivery type
            <select value={deliveryType} onChange={(event) => setDeliveryType(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="48">Normal delivery</option><option value="12">On-demand delivery</option></select>
          </label>
          <label className="text-sm font-medium">Destination city
            <select value={cityId} onChange={(event) => void loadZones(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="">Select city (optional)</option>{cities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}</select>
          </label>
          <label className="text-sm font-medium">Destination zone
            <select value={zoneId} onChange={(event) => void loadAreas(event.target.value)} disabled={!cityId} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="">Select zone (optional)</option>{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select>
          </label>
          <label className="text-sm font-medium sm:col-span-2">Destination area
            <select value={areaId} onChange={(event) => setAreaId(event.target.value)} disabled={!zoneId} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="">Select area (optional)</option>{areas.map((area) => <option key={area.id} value={area.id}>{area.name}{area.available === false ? " (Home delivery unavailable)" : ""}</option>)}</select>
          </label>
        </div>
        <button type="submit" disabled={quoteLoading || !storeId || !weight} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{quoteLoading ? "Calculating..." : "Calculate Pathao Charge"}</button>
        {quote !== null && <pre className="max-h-64 overflow-auto rounded-lg bg-gray-50 p-3 text-xs">{JSON.stringify(quote, null, 2)}</pre>}
      </form>

      <section className="mt-5 space-y-3 rounded-xl border border-gray-200 p-4">
        <div>
          <h3 className="font-semibold">Returns, Reverse Pickup, Exchange & Partial Delivery</h3>
          <p className="mt-1 text-xs leading-5 text-gray-600">These are supported Pathao merchant operations, but the public merchant API references available to NEWEIX do not document safe create-request endpoints for them. Use the official Merchant Panel workflow below; NEWEIX will not send guessed API requests or change stock/payment records automatically.</p>
        </div>
        <a href="https://merchant.pathao.com/courier/" target="_blank" rel="noreferrer" className="inline-flex rounded-lg border px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50">Open Pathao Merchant Panel</a>
        <div className="grid gap-3 md:grid-cols-2">
          <article className="rounded-lg bg-gray-50 p-3">
            <h4 className="text-sm font-semibold">Reverse Pickup (delivered by Pathao)</h4>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs leading-5 text-gray-700">
              <li>Open Deliveries and find the delivered consignment.</li>
              <li>Open View → More → Reverse Delivery.</li>
              <li>Confirm the return request in Pathao and record its return consignment ID in the order notes.</li>
            </ol>
            <p className="mt-2 text-xs text-gray-500">For parcels not originally delivered by Pathao, Pathao instructs merchants to create a normal delivery to their store address, enter “Reverse Pickup” in special instructions, and contact their KAM/Support before 4 PM.</p>
          </article>
          <article className="rounded-lg bg-gray-50 p-3">
            <h4 className="text-sm font-semibold">Product Exchange</h4>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs leading-5 text-gray-700">
              <li>Open the delivered consignment&apos;s View page.</li>
              <li>Create an Exchange Parcel ID.</li>
              <li>Arrange the replacement parcel and tell the customer to hand the original item to the courier.</li>
              <li>Record both consignment IDs and inspect the returned item before updating inventory.</li>
            </ol>
          </article>
          <article className="rounded-lg bg-gray-50 p-3">
            <h4 className="text-sm font-semibold">Partial Delivery</h4>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs leading-5 text-gray-700">
              <li>In Pathao Merchant Panel, open Dashboard → New Deliveries → Partial.</li>
              <li>Provide Store, customer&apos;s phone number and Cash Collection Amount.</li>
              <li>Complete the partial entry by 9 PM.</li>
              <li>Verify which items were accepted and returned before changing NEWEIX order quantities or stock.</li>
            </ol>
          </article>
          <article className="rounded-lg bg-gray-50 p-3">
            <h4 className="text-sm font-semibold">Status safety</h4>
            <p className="mt-2 text-xs leading-5 text-gray-700">Partial Delivery, Exchange, Return ID Created, Return In Transit and On Hold are not equivalent to Delivered or Returned. NEWEIX now leaves the main order delivery state unchanged for these intermediate/special states rather than incorrectly closing the shipment.</p>
          </article>
        </div>
        <p className="text-xs text-gray-500">Official instructions: <a className="underline" href="https://help.pathao.com/return-product-or-reverse-pickup-entry/" target="_blank" rel="noreferrer">Reverse Pickup</a> · <a className="underline" href="https://help.pathao.com/can-product-exchange-be-delivered/" target="_blank" rel="noreferrer">Exchange</a> · <a className="underline" href="https://help.pathao.com/make-an-entry-for-a-partial-order/" target="_blank" rel="noreferrer">Partial Delivery</a> · <a className="underline" href="https://help.pathao.com/merchant-help-center/" target="_blank" rel="noreferrer">Merchant Help Center</a>.</p>
      </section>

      <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
        <h3 className="text-sm font-bold text-emerald-950">Automatic shipment updates (Webhook)</h3>
        <p className="mt-1 text-xs leading-5 text-emerald-900">Callback URL for Pathao Merchant Panel → Developer API → Webhook Integration:</p>
        <code className="mt-2 block break-all rounded-lg bg-white px-3 py-2 text-xs text-gray-800">https://neweix.com/api/webhooks/pathao</code>
        <p className="mt-2 text-xs leading-5 text-emerald-900">Keep PATHAO_WEBHOOK_SECRET in Cloudflare Worker secrets. Never expose merchant credentials or webhook secrets in browser code. NEWEIX treats webhook events as signals and verifies shipment state with Pathao before applying updates.</p>
      </div>
      {stores !== null && <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold">View Pathao Store Response</summary><pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-gray-50 p-3 text-xs">{JSON.stringify(stores, null, 2)}</pre></details>}
      {cities.length > 0 && <p className="mt-3 text-xs text-gray-500">{cities.length} Pathao cities loaded. Select a city to load zones and areas.</p>}
    </section>
  );
}
