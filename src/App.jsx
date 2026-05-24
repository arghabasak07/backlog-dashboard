import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import "./App.css";

const API_URL =
  "https://script.google.com/macros/s/AKfycbzKeAZ2k3oLrT2fgH7dtJpJjNXVPtPohCzkc7dBNCnc40zbsX51o8KpoCuwnoSoWqSOCg/exec";

const CACHE_KEY = "carrybee-backlog-dashboard-cache";

const NAVY = "#1C2B3A";
const CRIMSON = "#E05C3A";
const GREEN = "#2E7D6B";
const TEAL = "#2E7D6B";
const GOLD = "#C99B00";

const SHEET_TIMEZONE = "Asia/Dhaka";

const APPENDIX_ITEMS = [
  ["Total In-Process Parcels", "Total active FID parcels from ISD and OSD for the selected date."],
  ["Overall Backlog", "Combined undelivered backlog from FID and RID pipelines."],
  ["FID Backlog", "Total pending First Inbound Delivery parcels for the selected date."],
  ["RID Backlog", "Total pending Return Inbound Delivery parcels for the selected date."],
  ["FID Backlog %", "FID backlog share compared with total in-process parcels."],
  ["Zone Transfer Parcels", "Parcels transferred between delivery zones on the selected date."],
  ["Zone Change %", "Zone transfer parcels as a percentage of total in-process parcels."],
  ["Region-wise In-Process Parcels", "ISD and OSD parcel volume comparison for the selected date."],
  ["Sort", "Comparison of FID Sort and RID Sort parcel counts."],
  ["Aging Distribution", "Day-wise aging split of ISD and OSD parcels from 1 day to 10+ days."],
  ["Date-wise Progress Tracking", "Daily trend of FID total in-process and worked-on parcels."],
  ["ISD", "Inbound Standard Delivery."],
  ["OSD", "Outbound Standard Delivery."],
  ["SUB", "Sub-hub or intermediate processing stage."],
  ["LMH", "Last Mile Hub, the final hub before customer delivery."],
  ["FMH", "First Mile Hub, the entry point into the delivery network."],
  ["FID", "First Inbound Delivery cycle."],
  ["RID", "Return Inbound Delivery cycle."],
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const num = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return value;

  const cleaned = String(value).replace(/,/g, "").replace(/%/g, "").trim();
  const parsed = Number(cleaned);

  return Number.isNaN(parsed) ? 0 : parsed;
};

const isBlank = (value) =>
  value === null || value === undefined || String(value).trim() === "";

const fmt = (value) => num(value).toLocaleString();

const fmtMaybe = (value) => {
  if (isBlank(value)) return "—";
  return fmt(value);
};

const fmtPercent = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }

  return `${Number(value).toFixed(2)}%`;
};

const fmtK = (value) => {
  const n = num(value);
  return n >= 1000 ? `${(n / 1000).toFixed(0)}K` : n;
};

const normalizeRow = (row) => {
  const normalized = {};

  Object.entries(row || {}).forEach(([key, value]) => {
    const cleanKey = String(key || "").trim();
    const cleanValue = typeof value === "string" ? value.trim() : value;
    normalized[cleanKey] = cleanValue;
  });

  return normalized;
};

const normalizeHeader = (key) =>
  String(key || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const getCellValue = (row, possibleHeaders = []) => {
  if (!row) return "";

  for (const header of possibleHeaders) {
    if (!isBlank(row[header])) {
      return row[header];
    }
  }

  const rowKeys = Object.keys(row);

  for (const expectedHeader of possibleHeaders) {
    const expectedClean = normalizeHeader(expectedHeader);

    const matchedKey = rowKeys.find(
      (key) => normalizeHeader(key) === expectedClean
    );

    if (matchedKey && !isBlank(row[matchedKey])) {
      return row[matchedKey];
    }
  }

  return "";
};

const getDhakaDateFromIso = (isoValue) => {
  const parsed = new Date(isoValue);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SHEET_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);

  const day = Number(parts.find((part) => part.type === "day")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const year = Number(parts.find((part) => part.type === "year")?.value);

  if (!day || !month || !year) return null;

  return new Date(year, month - 1, day);
};

const parseDate = (value) => {
  if (!value) return null;

  if (value instanceof Date) {
    return getDhakaDateFromIso(value.toISOString());
  }

  const clean = String(value).trim();

  const isoDateTimeMatch = clean.match(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
  );

  if (isoDateTimeMatch) {
    const dhakaDate = getDhakaDateFromIso(clean);
    if (dhakaDate) return dhakaDate;
  }

  const textMatch = clean.match(
    /^(\d{1,2})[\s-]+([A-Za-z]{3,})(?:[\s-]+(\d{4}))?/
  );

  if (textMatch) {
    const day = Number(textMatch[1]);
    const monthName = textMatch[2].slice(0, 3).toLowerCase();
    const year = textMatch[3] ? Number(textMatch[3]) : 2026;

    const monthMap = {
      jan: 0,
      feb: 1,
      mar: 2,
      apr: 3,
      may: 4,
      jun: 5,
      jul: 6,
      aug: 7,
      sep: 8,
      oct: 9,
      nov: 10,
      dec: 11,
    };

    if (monthMap[monthName] !== undefined) {
      return new Date(year, monthMap[monthName], day);
    }
  }

  const isoDateOnlyMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (isoDateOnlyMatch) {
    return new Date(
      Number(isoDateOnlyMatch[1]),
      Number(isoDateOnlyMatch[2]) - 1,
      Number(isoDateOnlyMatch[3])
    );
  }

  const parsed = new Date(clean);

  if (!Number.isNaN(parsed.getTime())) {
    return getDhakaDateFromIso(parsed.toISOString());
  }

  return null;
};

const toDateLabel = (value) => {
  const d = parseDate(value);

  if (!d) return String(value || "");

  const day = d.getDate();
  const month = d.toLocaleString("en-GB", { month: "short" });

  return `${day} ${month}`;
};

const getDateKey = (value) => toDateLabel(value);

const uniqueByKey = (arr) => {
  const seen = new Set();

  return arr.filter((item) => {
    if (!item.key || seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
};

const getPreviousDateKeyFromRows = (rows, dateField, selectedDateKey) => {
  const selectedDate = parseDate(selectedDateKey);

  if (!selectedDate) return "";

  const selectedTime = selectedDate.getTime();

  const dateItems = uniqueByKey(
    (rows || [])
      .map((row) => {
        const key = getDateKey(row?.[dateField]);
        const date = parseDate(key);

        return {
          key,
          time: date ? date.getTime() : null,
        };
      })
      .filter((item) => item.key && item.time !== null)
  ).sort((a, b) => a.time - b.time);

  const previous = dateItems
    .filter((item) => item.time < selectedTime)
    .slice(-1)[0];

  return previous?.key || "";
};

const getDashboardCardRow = (dashboardRows, selectedDateKey) => {
  if (!dashboardRows || dashboardRows.length === 0) return {};

  return (
    dashboardRows.find(
      (row) => row["Date"] && getDateKey(row["Date"]) === selectedDateKey
    ) || {}
  );
};

const getBacklogRow = (backlogRows, dateKey) => {
  return backlogRows.find((row) => getDateKey(row["Date"]) === dateKey) || {};
};

const getAgingTotals = (agingRows, dashboardRows, dateKey) => {
  const selectedAgingRows = agingRows.filter(
    (row) => getDateKey(row["Report Date"]) === dateKey
  );

  const latestISD =
    selectedAgingRows.filter((row) => row["Region"] === "ISD").slice(-1)[0] ||
    {};

  const latestOSD =
    selectedAgingRows.filter((row) => row["Region"] === "OSD").slice(-1)[0] ||
    {};

  const dashboardRow = getDashboardCardRow(dashboardRows, dateKey);

  const hasAging =
    Object.keys(latestISD).length > 0 || Object.keys(latestOSD).length > 0;

  const isdTotal = hasAging
    ? num(latestISD["Total"])
    : !isBlank(dashboardRow["ISD"])
    ? num(dashboardRow["ISD"])
    : null;

  const osdTotal = hasAging
    ? num(latestOSD["Total"])
    : !isBlank(dashboardRow["OSD"])
    ? num(dashboardRow["OSD"])
    : null;

  const dashboardTotal = !isBlank(dashboardRow["Total"])
    ? num(dashboardRow["Total"])
    : null;

  const totalParcels =
    isdTotal !== null || osdTotal !== null
      ? num(isdTotal) + num(osdTotal)
      : dashboardTotal !== null
      ? dashboardTotal
      : null;

  return {
    latestISD,
    latestOSD,
    hasAging,
    isdTotal,
    osdTotal,
    totalParcels,
  };
};

const getBacklogTotals = (backlogRow) => {
  const fidBacklog = !isBlank(backlogRow["FID Backlog"])
    ? num(backlogRow["FID Backlog"])
    : null;

  const ridBacklog = !isBlank(backlogRow["RID Backlog"])
    ? num(backlogRow["RID Backlog"])
    : null;

  const totalBacklog =
    fidBacklog !== null || ridBacklog !== null
      ? num(fidBacklog) + num(ridBacklog)
      : null;

  return {
    fidBacklog,
    ridBacklog,
    totalBacklog,
  };
};

const getFidBacklogPercent = ({
  dashboardRow,
  backlogRow,
  fidBacklog,
  totalParcels,
}) => {
  const sheetValue = getCellValue(dashboardRow, [
    "FID Backlog %",
    "FID Backlog Percent",
    "FID Backlog Percentage",
    "FID %",
    "FID Percent",
  ]);

  if (!isBlank(sheetValue)) {
    const parsedValue = num(sheetValue);
    return parsedValue <= 1 ? parsedValue * 100 : parsedValue;
  }

  const backlogSheetValue = getCellValue(backlogRow, [
    "FID Backlog %",
    "FID Backlog Percent",
    "FID Backlog Percentage",
    "FID %",
    "FID Percent",
  ]);

  if (!isBlank(backlogSheetValue)) {
    const parsedValue = num(backlogSheetValue);
    return parsedValue <= 1 ? parsedValue * 100 : parsedValue;
  }

  if (fidBacklog !== null && totalParcels) {
    return (fidBacklog / totalParcels) * 100;
  }

  return null;
};

const getZoneTransferData = (dashboardRows, selectedDateKey, totalInProcess) => {
  const selectedRow = getDashboardCardRow(dashboardRows, selectedDateKey);

  const zoneTransfer = isBlank(selectedRow["Zone Transfer"])
    ? null
    : num(selectedRow["Zone Transfer"]);

  let zoneTransferPct = null;

  if (!isBlank(selectedRow["Zone Transfer (%)"])) {
    zoneTransferPct = num(selectedRow["Zone Transfer (%)"]);

    if (zoneTransferPct <= 1) {
      zoneTransferPct = zoneTransferPct * 100;
    }
  } else if (zoneTransfer !== null && totalInProcess) {
    zoneTransferPct = (zoneTransfer / totalInProcess) * 100;
  }

  return {
    value: zoneTransfer,
    pct: zoneTransferPct,
  };
};

const getKpiDelta = (currentValue, previousValue, type) => {
  if (
    currentValue === null ||
    currentValue === undefined ||
    previousValue === null ||
    previousValue === undefined
  ) {
    return null;
  }

  const diff = currentValue - previousValue;

  if (diff === 0) {
    return {
      text: "0",
      dir: "neutral",
      arrow: "—",
    };
  }

  const absDiff =
    type === "percent"
      ? `${Math.abs(diff).toFixed(2)}%`
      : Math.abs(diff).toLocaleString();

  if (type === "parcel") {
    return {
      text: absDiff,
      dir: diff > 0 ? "good-up" : "bad-down",
      arrow: diff > 0 ? "▲" : "▼",
    };
  }

  return {
    text: absDiff,
    dir: diff > 0 ? "bad-up" : "good-down",
    arrow: diff > 0 ? "▲" : "▼",
  };
};

const fetchAppsScriptData = async () => {
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(
        `${API_URL}?t=${Date.now()}&attempt=${attempt}`,
        {
          method: "GET",
          cache: "no-store",
          redirect: "follow",
        }
      );

      if (!response.ok) {
        throw new Error(`API request failed: HTTP ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Apps Script API returned an error");
      }

      return data;
    } catch (error) {
      lastError = error;

      if (attempt < 3) {
        await sleep(900 * attempt);
      }
    }
  }

  throw lastError;
};

const ParcelIcon = () => (
  <svg width="42" height="42" viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <path
      d="M24 5L40 14V34L24 43L8 34V14L24 5Z"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinejoin="round"
    />
    <path
      d="M8 14L24 23L40 14"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinejoin="round"
    />
    <path
      d="M24 23V43"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinejoin="round"
    />
    <path
      d="M16 9.5L32 18.5"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
    />
  </svg>
);

const ClipboardIcon = () => (
  <svg width="42" height="42" viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <path
      d="M16 9H12C10.9 9 10 9.9 10 11V40C10 41.1 10.9 42 12 42H36C37.1 42 38 41.1 38 40V11C38 9.9 37.1 9 36 9H32"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M17 13H31V8H17V13Z"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinejoin="round"
    />
    <path d="M17 22H31" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    <path d="M17 30H31" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
  </svg>
);

const PercentRingIcon = () => (
  <svg width="48" height="48" viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <path
      d="M32 8A24 24 0 1 1 15.03 15.03"
      stroke="currentColor"
      strokeWidth="8"
      strokeLinecap="round"
    />
    <path
      d="M32 8A24 24 0 0 1 56 32"
      stroke="currentColor"
      strokeWidth="8"
      strokeLinecap="round"
      opacity="0.35"
    />
    <text
      x="32"
      y="40"
      textAnchor="middle"
      fontSize="26"
      fontWeight="900"
      fill="currentColor"
    >
      %
    </text>
  </svg>
);

const ZoneTransferIcon = () => (
  <svg width="44" height="44" viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <path d="M18 23H47" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
    <path
      d="M39 15L47 23L39 31"
      stroke="currentColor"
      strokeWidth="6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M46 41H17" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
    <path
      d="M25 33L17 41L25 49"
      stroke="currentColor"
      strokeWidth="6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ZonePercentIcon = () => (
  <svg width="50" height="50" viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <path
      d="M50 20A22 22 0 0 0 15 18"
      stroke="currentColor"
      strokeWidth="7"
      strokeLinecap="round"
    />
    <path d="M14 18V8" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
    <path d="M14 18H24" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
    <path
      d="M14 44A22 22 0 0 0 49 46"
      stroke="currentColor"
      strokeWidth="7"
      strokeLinecap="round"
    />
    <path d="M50 46V56" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
    <path d="M50 46H40" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
    <text
      x="32"
      y="41"
      textAnchor="middle"
      fontSize="26"
      fontWeight="900"
      fill="currentColor"
    >
      %
    </text>
  </svg>
);

const BarIcon = () => (
  <svg width="42" height="42" viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <path d="M10 38V24" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
    <path d="M24 38V12" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
    <path d="M38 38V19" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
  </svg>
);

const TrendIcon = () => (
  <svg width="42" height="42" viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <path
      d="M8 34L18 24L27 29L40 14"
      stroke="currentColor"
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M31 14H40V23"
      stroke="currentColor"
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const KPICard = ({ icon, title, value, delta, accent, iconClass = "" }) => (
  <div className={`card accent-${accent}`}>
    <div className={`card-icon ${iconClass}`}>{icon}</div>

    <div className="card-content">
      <h3>{title}</h3>
      <h2>{value}</h2>

      {delta && (
        <span className={`card-delta ${delta.dir}`}>
          <span className="delta-arrow">{delta.arrow}</span>
          <span>{delta.text}</span>
        </span>
      )}
    </div>
  </div>
);

const HBar = ({ label, value, max, color }) => {
  if (isBlank(value)) return null;

  return (
    <div className="hbar-row">
      <span className="hbar-label">{label}</span>

      <div className="hbar-track">
        <div
          className="hbar-fill"
          style={{
            width:
              max > 0 ? `${Math.min((num(value) / max) * 100, 100)}%` : "0%",
            background: color,
          }}
        >
          {num(value) > max * 0.18 ? fmt(value) : ""}
        </div>
      </div>

      <span className="hbar-value">{fmt(value)}</span>
    </div>
  );
};

const StackedBar = ({ label, isd, sub, osd }) => {
  const hasAnyValue = !isBlank(isd) || !isBlank(sub) || !isBlank(osd);

  if (!hasAnyValue) return null;

  const total = num(isd) + num(sub) + num(osd);

  if (total === 0) return null;

  const pISD = (num(isd) / total) * 100;
  const pSUB = (num(sub) / total) * 100;
  const pOSD = (num(osd) / total) * 100;

  return (
    <div className="stacked-bar-row">
      <span className="stacked-bar-label">{label}</span>

      <div className="stacked-bar-track">
        {!isBlank(isd) && num(isd) > 0 && (
          <div
            className={`stacked-bar-segment seg-isd ${
              pISD < 9 ? "tiny-segment" : ""
            }`}
            style={{ width: `${pISD}%` }}
          >
            <span className="stacked-value">{fmt(isd)}</span>
          </div>
        )}

        {!isBlank(sub) && num(sub) > 0 && (
          <div
            className={`stacked-bar-segment seg-sub ${
              pSUB < 9 ? "tiny-segment" : ""
            }`}
            style={{ width: `${pSUB}%` }}
          >
            <span className="stacked-value">{fmt(sub)}</span>
          </div>
        )}

        {!isBlank(osd) && num(osd) > 0 && (
          <div
            className={`stacked-bar-segment seg-osd ${
              pOSD < 9 ? "tiny-segment" : ""
            }`}
            style={{ width: `${pOSD}%` }}
          >
            <span className="stacked-value">{fmt(osd)}</span>
          </div>
        )}
      </div>

      <span className="stacked-bar-total">{fmt(total)}</span>
    </div>
  );
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload || {};

  return (
    <div className="custom-tooltip">
      <p className="tooltip-label">{label}</p>

      <p style={{ color: "#ffffff" }}>
        <span>Total In Progress:</span>{" "}
        <strong>
          {row.totalInProgress !== null && row.totalInProgress !== undefined
            ? row.totalInProgress.toLocaleString()
            : "—"}
        </strong>
      </p>

      <p style={{ color: "#ffffff" }}>
        <span>Worked On:</span>{" "}
        <strong>
          {row.workedOn !== null && row.workedOn !== undefined
            ? row.workedOn.toLocaleString()
            : "—"}
        </strong>
      </p>
    </div>
  );
};

function App() {
  const [backlog, setBacklog] = useState([]);
  const [tracking, setTracking] = useState([]);
  const [aging, setAging] = useState([]);
  const [dashboardCard, setDashboardCard] = useState([]);
  const [selectedDateKey, setSelectedDateKey] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const applyDataToState = (data) => {
    const cleanTrackingRows = (data.tracking || [])
      .map(normalizeRow)
      .filter(
        (row) =>
          row["Report Date"] &&
          row["Total In Progress (Backlog)"] !== undefined
      );

    const cleanBacklogRows = (data.backlog || [])
      .map(normalizeRow)
      .filter((row) => row["Date"] || row["FID Backlog"] !== undefined);

    const cleanAgingRows = (data.aging || [])
      .map(normalizeRow)
      .filter((row) => row["Region"] === "ISD" || row["Region"] === "OSD");

    const cleanDashboardRows = (data.dashboardCard || []).map(normalizeRow);

    setTracking(cleanTrackingRows);
    setBacklog(cleanBacklogRows);
    setAging(cleanAgingRows);
    setDashboardCard(cleanDashboardRows);

    const lastDateKey = getDateKey(
      cleanTrackingRows[cleanTrackingRows.length - 1]?.["Report Date"]
    );

    setSelectedDateKey((current) => {
      const allDateKeys = cleanTrackingRows.map((row) =>
        getDateKey(row["Report Date"])
      );

      if (current && allDateKeys.includes(current)) {
        return current;
      }

      return lastDateKey;
    });
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await fetchAppsScriptData();

      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          savedAt: new Date().toISOString(),
          data,
        })
      );

      applyDataToState(data);

      setLastUpdated(
        new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );

      setLoading(false);
    } catch (err) {
      console.error("Live API failed:", err);

      const cached = localStorage.getItem(CACHE_KEY);

      if (cached) {
        try {
          const parsedCache = JSON.parse(cached);
          applyDataToState(parsedCache.data);
          setLastUpdated("Using cached data");
          setError(null);
          setLoading(false);
          return;
        } catch (cacheError) {
          console.error("Cache load failed:", cacheError);
        }
      }

      setError(err.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading live Google Sheets data…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="loading-screen">
        <p style={{ color: CRIMSON, fontWeight: 700 }}>
          ⚠ Could not fetch Apps Script API: {error}
        </p>

        <p style={{ fontSize: 13, color: "#4a5980", marginTop: 8 }}>
          Check Apps Script deployment access: Execute as Me, Who has access:
          Anyone.
        </p>
      </div>
    );
  }

  const dateOptions = uniqueByKey(
    tracking.map((row) => ({
      key: getDateKey(row["Report Date"]),
      label: toDateLabel(row["Report Date"]),
    }))
  );

  const selectedTrackingIndexRaw = tracking.findIndex(
    (row) => getDateKey(row["Report Date"]) === selectedDateKey
  );

  const selectedTrackingIndex =
    selectedTrackingIndexRaw >= 0
      ? selectedTrackingIndexRaw
      : tracking.length - 1;

  const selectedWindowTracking = tracking.slice(
    Math.max(0, selectedTrackingIndex - 6),
    selectedTrackingIndex + 1
  );

  const selectedTracking = tracking[selectedTrackingIndex] || {};

  const fallbackPrevDateKey =
    selectedTrackingIndex > 0
      ? getDateKey(tracking[selectedTrackingIndex - 1]?.["Report Date"])
      : "";

  const previousAgingDateKey =
    getPreviousDateKeyFromRows(aging, "Report Date", selectedDateKey) ||
    fallbackPrevDateKey;

  const previousBacklogDateKey =
    getPreviousDateKeyFromRows(backlog, "Date", selectedDateKey) ||
    fallbackPrevDateKey;

  const previousDashboardDateKey =
    getPreviousDateKeyFromRows(dashboardCard, "Date", selectedDateKey) ||
    fallbackPrevDateKey;

  const selectedBacklog = getBacklogRow(backlog, selectedDateKey);
  const previousBacklog = getBacklogRow(backlog, previousBacklogDateKey);

  const selectedDashboardCard = getDashboardCardRow(
    dashboardCard,
    selectedDateKey
  );

  const previousDashboardCard = getDashboardCardRow(
    dashboardCard,
    previousDashboardDateKey
  );

  const hasBacklogForSelectedDate = Object.keys(selectedBacklog).length > 0;

  const {
    latestISD,
    latestOSD,
    hasAging: hasAgingForSelectedDate,
    isdTotal,
    osdTotal,
    totalParcels,
  } = getAgingTotals(aging, dashboardCard, selectedDateKey);

  const previousAgingTotals = getAgingTotals(
    aging,
    dashboardCard,
    previousAgingDateKey || previousDashboardDateKey
  );

  const { fidBacklog, ridBacklog, totalBacklog } =
    getBacklogTotals(selectedBacklog);

  const previousBacklogTotals = getBacklogTotals(previousBacklog);

  const fidBacklogPercent = getFidBacklogPercent({
    dashboardRow: selectedDashboardCard,
    backlogRow: selectedBacklog,
    fidBacklog,
    totalParcels,
  });

  const previousFidBacklogPercent = getFidBacklogPercent({
    dashboardRow: previousDashboardCard,
    backlogRow: previousBacklog,
    fidBacklog: previousBacklogTotals.fidBacklog,
    totalParcels: previousAgingTotals.totalParcels,
  });

  const totalParcelsDelta = getKpiDelta(
    totalParcels,
    previousAgingTotals.totalParcels,
    "parcel"
  );

  const totalBacklogDelta = getKpiDelta(
    totalBacklog,
    previousBacklogTotals.totalBacklog,
    "backlog"
  );

  const fidBacklogDelta = getKpiDelta(
    fidBacklog,
    previousBacklogTotals.fidBacklog,
    "backlog"
  );

  const ridBacklogDelta = getKpiDelta(
    ridBacklog,
    previousBacklogTotals.ridBacklog,
    "backlog"
  );

  const fidBacklogPercentDelta = getKpiDelta(
    fidBacklogPercent,
    previousFidBacklogPercent,
    "percent"
  );

  const trackingTotalInProgress = !isBlank(
    selectedTracking["Total In Progress (Backlog)"]
  )
    ? num(selectedTracking["Total In Progress (Backlog)"])
    : null;

  const zoneTransferData = getZoneTransferData(
    dashboardCard,
    selectedDateKey,
    totalParcels
  );

  const prevZoneTransferData = getZoneTransferData(
    dashboardCard,
    previousDashboardDateKey,
    previousAgingTotals.totalParcels || totalParcels
  );

  const zoneTransfer = zoneTransferData.value;
  const zoneTransferPct = zoneTransferData.pct;
  const prevZoneTransferPct = prevZoneTransferData.pct;

  const zoneTransferPctHasDelta =
    zoneTransferPct !== null &&
    prevZoneTransferPct !== null &&
    prevZoneTransferPct > 0;

  const zoneTransferPctDiff = zoneTransferPctHasDelta
    ? Math.abs(zoneTransferPct - prevZoneTransferPct).toFixed(2)
    : null;

  const zoneTransferPctIncreased =
    zoneTransferPctHasDelta && zoneTransferPct > prevZoneTransferPct;

  const zoneTransferPctDeltaText = zoneTransferPctHasDelta
    ? zoneTransferPctIncreased
      ? `${zoneTransferPctDiff}% increased`
      : `${zoneTransferPctDiff}% decreased`
    : "";

  const zoneTransferPctDeltaDir = zoneTransferPctHasDelta
    ? zoneTransferPctIncreased
      ? "bad-up"
      : "good-down"
    : "";

  const fidLMH_ISD = getCellValue(selectedBacklog, ["FID LMH ISD"]);
  const fidLMH_SUB = getCellValue(selectedBacklog, ["FID LMH SUB"]);
  const fidLMH_OSD = getCellValue(selectedBacklog, ["FID LMH OSD"]);
  const fidFMH = getCellValue(selectedBacklog, ["FID FMH"]);

  const ridFMH_ISD = getCellValue(selectedBacklog, ["RID FMH ISD"]);
  const ridFMH_SUB = getCellValue(selectedBacklog, ["RID FMH SUB"]);
  const ridFMH_OSD = getCellValue(selectedBacklog, ["RID FMH OSD"]);

  const ridLMH_ISD = getCellValue(selectedBacklog, ["RID LMH ISD"]);
  const ridLMH_SUB = getCellValue(selectedBacklog, ["RID LMH SUB"]);
  const ridLMH_OSD = getCellValue(selectedBacklog, ["RID LMH OSD"]);

  const fidSort = getCellValue(selectedBacklog, [
    "FID Sort",
    "FID SORT",
    "FID sort",
    "FID Sorting",
  ]);

  const ridSort = getCellValue(selectedBacklog, [
    "RID Sort",
    "RID SORT",
    "RID sort",
    "RID Sorting",
  ]);

  const sortMax = Math.max(num(fidSort), num(ridSort), 1);

  const hbarRegionMax = Math.max(
    num(isdTotal),
    num(osdTotal),
    num(trackingTotalInProgress),
    1
  );

  const BUCKETS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, "10+"];

  const trendData = selectedWindowTracking.map((row) => ({
    date: toDateLabel(row["Report Date"]),
    totalInProgress: !isBlank(row["Total In Progress (Backlog)"])
      ? num(row["Total In Progress (Backlog)"])
      : null,
    workedOn: !isBlank(row["Worked On"]) ? num(row["Worked On"]) : null,
  }));

  const reportDate =
    toDateLabel(selectedTracking["Report Date"]) || "Selected Date";

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="header-left">
          <h1 className="brand-title">
            Carry<span className="bee-b">B</span>ee Backlog <span>Report</span>
          </h1>

          <p className="subtitle">
            Live Google Sheets Dashboard
            {lastUpdated && (
              <>
                <span className="divider" />
                Last refreshed: {lastUpdated}
              </>
            )}
          </p>
        </div>

        <div className="header-actions">
          <div className="date-filter">
            <label>Select Date</label>

            <select
              value={selectedDateKey}
              onChange={(event) => setSelectedDateKey(event.target.value)}
            >
              {dateOptions.map((date) => (
                <option key={date.key} value={date.key}>
                  {date.label}
                </option>
              ))}
            </select>
          </div>

          <button
            className="badge-date"
            onClick={loadData}
            style={{ border: "none", cursor: "pointer" }}
          >
            🔄 Refresh Data
          </button>
        </div>
      </div>

      <div className="cards cards-five">
        <KPICard
          icon={<ParcelIcon />}
          accent="navy"
          title="In Process Parcels"
          value={fmtMaybe(totalParcels)}
          delta={totalParcelsDelta}
          iconClass="parcel-icon"
        />

        <KPICard
          icon={<ClipboardIcon />}
          accent="crimson"
          title="Overall Backlog"
          value={fmtMaybe(totalBacklog)}
          delta={totalBacklogDelta}
          iconClass="clipboard-icon"
        />

        <KPICard
          icon={<TrendIcon />}
          accent="amber"
          title="FID Backlog"
          value={fmtMaybe(fidBacklog)}
          delta={fidBacklogDelta}
          iconClass="trend-icon"
        />

        <KPICard
          icon={<PercentRingIcon />}
          accent="amber"
          title="FID Backlog %"
          value={fmtPercent(fidBacklogPercent)}
          delta={fidBacklogPercentDelta}
          iconClass="percent-icon"
        />

        <KPICard
          icon={<BarIcon />}
          accent="teal"
          title="RID Backlog"
          value={fmtMaybe(ridBacklog)}
          delta={ridBacklogDelta}
          iconClass="bar-icon"
        />
      </div>

      <div className="chartBox full">
        <div className="box-header">
          <span className="box-title">Region wise In-Process Parcels</span>
        </div>

        {isdTotal !== null || osdTotal !== null ? (
          <>
            <HBar label="ISD" value={isdTotal} max={hbarRegionMax} color={NAVY} />
            <HBar label="OSD" value={osdTotal} max={hbarRegionMax} color={GOLD} />
          </>
        ) : (
          <p style={{ color: "#4a5980", fontWeight: 600 }}>
            Region-wise data is not available for {reportDate}.
          </p>
        )}
      </div>

      <div className="full">
        <div className="box-header">
          <span className="box-title">Backlog Details</span>

          <div className="legend">
            <span className="legend-item"><span className="legend-dot navy" />ISD</span>
            <span className="legend-item"><span className="legend-dot green" />SUB</span>
            <span className="legend-item"><span className="legend-dot gold" />OSD</span>
          </div>
        </div>

        {hasBacklogForSelectedDate ? (
          <>
            <StackedBar label="FID LMH" isd={fidLMH_ISD} sub={fidLMH_SUB} osd={fidLMH_OSD} />
            <StackedBar label="FID FMH" isd={fidFMH} sub="" osd="" />
            <StackedBar label="RID LMH" isd={ridLMH_ISD} sub={ridLMH_SUB} osd={ridLMH_OSD} />
            <StackedBar label="RID FMH" isd={ridFMH_ISD} sub={ridFMH_SUB} osd={ridFMH_OSD} />
          </>
        ) : (
          <p style={{ color: "#4a5980", fontWeight: 600 }}>
            Detailed FID/RID breakdown is not available for {reportDate}.
          </p>
        )}
      </div>

      <div className="full">
        <div className="box-header">
          <span className="box-title">Sort</span>
        </div>

        {!isBlank(fidSort) || !isBlank(ridSort) ? (
          <>
            <HBar label="FID Sort" value={fidSort} max={sortMax} color={NAVY} />
            <HBar label="RID Sort" value={ridSort} max={sortMax} color={GOLD} />
          </>
        ) : (
          <p style={{ color: "#4a5980", fontWeight: 600 }}>
            Sort details are not available for {reportDate}.
          </p>
        )}
      </div>

      <div className="cards zone-transfer-row">
        <KPICard
          icon={<ZoneTransferIcon />}
          accent="amber"
          title="Zone Transfer Parcels"
          value={fmtMaybe(zoneTransfer)}
          iconClass="zone-icon"
        />

        <KPICard
          icon={<ZonePercentIcon />}
          accent="teal"
          title="Zone Change %"
          value={zoneTransferPct !== null ? `${zoneTransferPct.toFixed(2)}%` : "—"}
          delta={
            zoneTransferPctHasDelta
              ? {
                  text: zoneTransferPctDeltaText,
                  dir: zoneTransferPctDeltaDir,
                  arrow: zoneTransferPctIncreased ? "▲" : "▼",
                }
              : null
          }
          iconClass="zone-percent-icon"
        />
      </div>

      <div className="tableBox">
        <div className="box-header">
          <span className="box-title">Aging Distribution</span>

          <span className="badge-threshold">
            {hasAgingForSelectedDate
              ? "ISD 3+ | OSD 4+ days"
              : "No aging sheet data for this date"}
          </span>
        </div>

        {hasAgingForSelectedDate ? (
          <div style={{ overflowX: "auto" }}>
            <table className="aging-table">
              <thead>
                <tr>
                  <th>Region</th>
                  {BUCKETS.map((bucket) => (
                    <th key={bucket}>{bucket}</th>
                  ))}
                  <th>Total</th>
                </tr>
              </thead>

              <tbody>
                <tr className="isd-row">
                  <td className="row-label isd">ISD</td>
                  {BUCKETS.map((bucket) => (
                    <td key={bucket}>{fmtMaybe(latestISD[bucket])}</td>
                  ))}
                  <td className="total-col">{fmtMaybe(isdTotal)}</td>
                </tr>

                <tr className="pct-row">
                  <td className="row-label">%</td>
                  {BUCKETS.map((bucket) => (
                    <td key={bucket} style={{ color: TEAL, fontSize: "11px" }}>
                      {!isBlank(latestISD[bucket]) && isdTotal
                        ? `${((num(latestISD[bucket]) / isdTotal) * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                  ))}
                  <td className="total-col">{isdTotal ? "100%" : "—"}</td>
                </tr>

                <tr className="osd-row">
                  <td className="row-label osd">OSD</td>
                  {BUCKETS.map((bucket) => (
                    <td key={bucket}>{fmtMaybe(latestOSD[bucket])}</td>
                  ))}
                  <td className="total-col">{fmtMaybe(osdTotal)}</td>
                </tr>

                <tr className="pct-row">
                  <td className="row-label">%</td>
                  {BUCKETS.map((bucket) => (
                    <td key={bucket} style={{ color: TEAL, fontSize: "11px" }}>
                      {!isBlank(latestOSD[bucket]) && osdTotal
                        ? `${((num(latestOSD[bucket]) / osdTotal) * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                  ))}
                  <td className="total-col">{osdTotal ? "100%" : "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: "#4a5980", fontWeight: 600 }}>
            Aging distribution data is not available for {reportDate}.
          </p>
        )}
      </div>

      <div className="chartBox full cool-chart-box">
        <div className="box-header">
          <span className="box-title">Date-wise FID Progress Tracking</span>

          <div className="legend">
            <span className="legend-item"><span className="legend-dot navy" />Total In Progress</span>
            <span className="legend-item"><span className="legend-dot green" />Worked On</span>
          </div>
        </div>

        <div className="cool-chart-inner">
          <ResponsiveContainer width="100%" height={330}>
            <AreaChart data={trendData} margin={{ top: 12, right: 24, left: 0, bottom: 4 }}>
              <defs>
                <linearGradient id="totalProgressGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={NAVY} stopOpacity={0.32} />
                  <stop offset="95%" stopColor={NAVY} stopOpacity={0.02} />
                </linearGradient>

                <linearGradient id="workedOnGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={GREEN} stopOpacity={0.28} />
                  <stop offset="95%" stopColor={GREEN} stopOpacity={0.02} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="4 6" stroke="#ded8cb" vertical />

              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: "#556577", fontWeight: 600 }}
                axisLine={false}
                tickLine={false}
                padding={{ left: 10, right: 10 }}
              />

              <YAxis
                tick={{ fontSize: 11, fill: "#8a96a3", fontWeight: 600 }}
                tickFormatter={fmtK}
                axisLine={false}
                tickLine={false}
                width={44}
              />

              <Tooltip content={<CustomTooltip />} />

              <Area
                type="monotone"
                dataKey="totalInProgress"
                name="Total In Progress"
                stroke={NAVY}
                strokeWidth={3}
                fill="url(#totalProgressGradient)"
                dot={{ r: 4, strokeWidth: 3, fill: "#ffffff", stroke: NAVY }}
                activeDot={{ r: 7, strokeWidth: 3, fill: "#ffffff", stroke: NAVY }}
                connectNulls={false}
              />

              <Area
                type="monotone"
                dataKey="workedOn"
                name="Worked On"
                stroke={GREEN}
                strokeWidth={3}
                fill="url(#workedOnGradient)"
                dot={{ r: 4, strokeWidth: 3, fill: "#ffffff", stroke: GREEN }}
                activeDot={{ r: 7, strokeWidth: 3, fill: "#ffffff", stroke: GREEN }}
                connectNulls={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="tableBox full">
        <div className="box-header">
          <span className="box-title">Date-wise Backlog Progress Tracking (FID)</span>
        </div>

        <table className="tracking-table">
          <thead>
            <tr>
              <th className="col-date">Date</th>
              <th className="col-new">Newly Added</th>
              <th className="col-total">Total In Process (Backlog)</th>
              <th className="col-worked">Worked On</th>
              <th className="col-carry">Carry Forward</th>
            </tr>
          </thead>

          <tbody>
            {selectedWindowTracking.map((row, index) => {
              const isSelected = getDateKey(row["Report Date"]) === selectedDateKey;

              return (
                <tr key={index} className={isSelected ? "highlight-row" : ""}>
                  <td style={{ textAlign: "left", fontWeight: 600 }}>
                    {toDateLabel(row["Report Date"])}
                  </td>

                  <td>{fmtMaybe(row["Newly Added"])}</td>
                  <td>{fmtMaybe(row["Total In Progress (Backlog)"])}</td>
                  <td>{fmtMaybe(row["Worked On"])}</td>
                  <td>{fmtMaybe(row["Carry Forward"])}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <details className="appendix-section">
        <summary>
          <span>Appendix</span>
          <small>KPI definitions and calculation notes</small>
        </summary>

        <div className="appendix-grid">
          {APPENDIX_ITEMS.map(([title, description]) => (
            <div className="appendix-item" key={title}>
              <strong>{title}</strong>
              <p>{description}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

export default App;