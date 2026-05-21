import { useEffect, useState } from "react";
import Papa from "papaparse";
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

const CSV_URLS = {
  backlog:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vSusJS7m9ish0SUQrKQOUiNuia9GoFrqvAjUkVrxkOebpbnX7otEopZ-_ThlWaVRj2KYEnUZN2AKrYJ/pub?gid=627589963&single=true&output=csv",

  aging:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vSusJS7m9ish0SUQrKQOUiNuia9GoFrqvAjUkVrxkOebpbnX7otEopZ-_ThlWaVRj2KYEnUZN2AKrYJ/pub?gid=2108632369&single=true&output=csv",

  dashboardCard:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vSusJS7m9ish0SUQrKQOUiNuia9GoFrqvAjUkVrxkOebpbnX7otEopZ-_ThlWaVRj2KYEnUZN2AKrYJ/pub?gid=233831813&single=true&output=csv",

  tracking:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vSusJS7m9ish0SUQrKQOUiNuia9GoFrqvAjUkVrxkOebpbnX7otEopZ-_ThlWaVRj2KYEnUZN2AKrYJ/pub?gid=713116247&single=true&output=csv",
};

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

const fmtK = (value) => {
  const n = num(value);
  return n >= 1000 ? `${(n / 1000).toFixed(0)}K` : n;
};

const normalizeRow = (row) => {
  const normalized = {};

  Object.entries(row).forEach(([key, value]) => {
    const cleanKey = String(key || "").trim();
    const cleanValue = typeof value === "string" ? value.trim() : value;
    normalized[cleanKey] = cleanValue;
  });

  return normalized;
};

const fetchCSV = async (url) => {
  const cacheBustedUrl = `${url}&t=${Date.now()}`;
  const response = await fetch(cacheBustedUrl);

  if (!response.ok) {
    throw new Error(`Could not fetch CSV: HTTP ${response.status}`);
  }

  const csvText = await response.text();

  return new Promise((resolve, reject) => {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const rows = result.data.map(normalizeRow);
        resolve(rows);
      },
      error: (error) => reject(error),
    });
  });
};

const fetchDashboardCardCSV = async (url) => {
  const cacheBustedUrl = `${url}&t=${Date.now()}`;
  const response = await fetch(cacheBustedUrl);

  if (!response.ok) {
    throw new Error(`Could not fetch Dashboard_Card CSV: HTTP ${response.status}`);
  }

  const csvText = await response.text();

  return new Promise((resolve, reject) => {
    Papa.parse(csvText, {
      header: false,
      skipEmptyLines: true,
      complete: (result) => {
        const rawRows = result.data;

        const headerRowIndex = rawRows.findIndex((row) => {
          const cells = row.map((cell) => String(cell || "").trim());
          return cells.includes("Date") && cells.includes("Zone Transfer");
        });

        if (headerRowIndex === -1) {
          resolve([]);
          return;
        }

        const headers = rawRows[headerRowIndex].map((header) =>
          String(header || "").trim()
        );

        const rows = rawRows
          .slice(headerRowIndex + 1)
          .filter((row) =>
            row.some((cell) => String(cell || "").trim() !== "")
          )
          .map((row) => {
            const obj = {};

            headers.forEach((header, index) => {
              if (header) {
                obj[header] =
                  typeof row[index] === "string"
                    ? row[index].trim()
                    : row[index];
              }
            });

            return obj;
          });

        resolve(rows);
      },
      error: (error) => reject(error),
    });
  });
};

const parseDate = (value) => {
  if (!value) return null;

  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  if (typeof value === "number") {
    const excelEpoch = new Date(1899, 11, 30);
    return new Date(
      excelEpoch.getTime() + Math.floor(value) * 24 * 60 * 60 * 1000
    );
  }

  const clean = String(value).trim();

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

  const parsed = new Date(clean);

  if (!Number.isNaN(parsed.getTime())) {
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
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

const getDashboardCardRow = (dashboardRows, selectedDateKey) => {
  if (!dashboardRows || dashboardRows.length === 0) return {};

  return (
    dashboardRows.find(
      (row) => row["Date"] && getDateKey(row["Date"]) === selectedDateKey
    ) || {}
  );
};

const getZoneTransferData = (dashboardRows, selectedDateKey, totalInProcess) => {
  const selectedRow = getDashboardCardRow(dashboardRows, selectedDateKey);

  const zoneTransfer = isBlank(selectedRow["Zone Transfer"])
    ? 0
    : num(selectedRow["Zone Transfer"]);

  let zoneTransferPct = 0;

  if (!isBlank(selectedRow["Zone Transfer (%)"])) {
    zoneTransferPct = num(selectedRow["Zone Transfer (%)"]);

    if (zoneTransferPct <= 1) {
      zoneTransferPct = zoneTransferPct * 100;
    }
  } else {
    zoneTransferPct = totalInProcess
      ? (zoneTransfer / totalInProcess) * 100
      : 0;
  }

  return {
    value: zoneTransfer,
    pct: zoneTransferPct,
  };
};

/* CarryBee brand colors */
const NAVY = "#1C2B3A";
const CRIMSON = "#E05C3A";
const GREEN = "#2E7D6B";
const TEAL = "#2E7D6B";

const KPICard = ({ icon, title, value, delta, deltaDir, accent }) => (
  <div className={`card accent-${accent}`}>
    <div className="card-icon">{icon}</div>

    <h3>{title}</h3>
    <h2>{value}</h2>

    {delta && (
      <span className={`card-delta ${deltaDir}`}>
        {deltaDir === "bad-down" ? "▼" : deltaDir === "good-up" ? "▲" : ""}{" "}
        {delta}
      </span>
    )}
  </div>
);

const HBar = ({ label, value, max, color }) => (
  <div className="hbar-row">
    <span className="hbar-label">{label}</span>

    <div className="hbar-track">
      <div
        className="hbar-fill"
        style={{
          width: max > 0 ? `${Math.min((num(value) / max) * 100, 100)}%` : "0%",
          background: color,
        }}
      >
        {num(value) > max * 0.18 ? fmt(value) : ""}
      </div>
    </div>

    <span className="hbar-value">{fmt(value)}</span>
  </div>
);

const StackedBar = ({ label, isd, sub, osd }) => {
  const total = num(isd) + num(sub) + num(osd);

  if (total === 0) return null;

  const pISD = (num(isd) / total) * 100;
  const pSUB = (num(sub) / total) * 100;
  const pOSD = (num(osd) / total) * 100;

  return (
    <div className="stacked-bar-row">
      <span className="stacked-bar-label">{label}</span>

      <div className="stacked-bar-track">
        {num(isd) > 0 && (
          <div
            className="stacked-bar-segment seg-isd"
            style={{ width: `${pISD}%` }}
          >
            {pISD > 9 ? fmt(isd) : ""}
          </div>
        )}

        {num(sub) > 0 && (
          <div
            className="stacked-bar-segment seg-sub"
            style={{ width: `${pSUB}%` }}
          >
            {pSUB > 9 ? fmt(sub) : ""}
          </div>
        )}

        {num(osd) > 0 && (
          <div
            className="stacked-bar-segment seg-osd"
            style={{ width: `${pOSD}%` }}
          >
            {pOSD > 9 ? fmt(osd) : ""}
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
          {row.totalInProgress != null
            ? row.totalInProgress.toLocaleString()
            : "—"}
        </strong>
      </p>

      <p style={{ color: "#ffffff" }}>
        <span>Worked On:</span>{" "}
        <strong>
          {row.workedOn != null ? row.workedOn.toLocaleString() : "—"}
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

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [trackingRows, backlogRows, agingRows, dashboardRows] =
        await Promise.all([
          fetchCSV(CSV_URLS.tracking),
          fetchCSV(CSV_URLS.backlog),
          fetchCSV(CSV_URLS.aging),
          fetchDashboardCardCSV(CSV_URLS.dashboardCard),
        ]);

      const cleanTrackingRows = trackingRows.filter(
        (row) =>
          row["Report Date"] &&
          row["Total In Progress (Backlog)"] !== undefined
      );

      const cleanBacklogRows = backlogRows.filter(
        (row) => row["Date"] || row["FID Backlog"] !== undefined
      );

      const cleanAgingRows = agingRows.filter(
        (row) => row["Region"] === "ISD" || row["Region"] === "OSD"
      );

      setTracking(cleanTrackingRows);
      setBacklog(cleanBacklogRows);
      setAging(cleanAgingRows);
      setDashboardCard(dashboardRows);

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

      setLastUpdated(
        new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );

      setLoading(false);
    } catch (err) {
      console.error(err);
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
        <p style={{ color: CRIMSON, fontWeight: 700 }}>⚠ {error}</p>

        <p style={{ fontSize: 13, color: "#4a5980", marginTop: 8 }}>
          Check whether your Google Sheets CSV links are published and accessible.
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

  const selectedBacklog =
    backlog.find((row) => getDateKey(row["Date"]) === selectedDateKey) || {};

  const selectedDashboardCard = getDashboardCardRow(
    dashboardCard,
    selectedDateKey
  );

  const hasBacklogForSelectedDate = Object.keys(selectedBacklog).length > 0;

  const selectedAgingRows = aging.filter(
    (row) => getDateKey(row["Report Date"]) === selectedDateKey
  );

  const latestISD =
    selectedAgingRows.filter((row) => row["Region"] === "ISD").slice(-1)[0] ||
    {};

  const latestOSD =
    selectedAgingRows.filter((row) => row["Region"] === "OSD").slice(-1)[0] ||
    {};

  const hasAgingForSelectedDate =
    Object.keys(latestISD).length > 0 || Object.keys(latestOSD).length > 0;

  const prevDateKey =
    selectedTrackingIndex > 0
      ? getDateKey(tracking[selectedTrackingIndex - 1]?.["Report Date"])
      : "";

  const prevAgingRows = aging.filter(
    (row) => getDateKey(row["Report Date"]) === prevDateKey
  );

  const prevISD =
    prevAgingRows.filter((row) => row["Region"] === "ISD").slice(-1)[0] || {};

  const prevOSD =
    prevAgingRows.filter((row) => row["Region"] === "OSD").slice(-1)[0] || {};

  const trackingTotalInProgress = num(
    selectedTracking["Total In Progress (Backlog)"]
  );

  const dashboardTotal = num(selectedDashboardCard["Total"]);

  const fidBacklog = hasBacklogForSelectedDate
    ? num(selectedBacklog["FID Backlog"])
    : trackingTotalInProgress;

  const ridBacklog = hasBacklogForSelectedDate
    ? num(selectedBacklog["RID Backlog"])
    : 0;

  const totalBacklog = hasBacklogForSelectedDate
    ? fidBacklog + ridBacklog
    : trackingTotalInProgress;

  const isdTotal = hasAgingForSelectedDate
    ? num(latestISD["Total"])
    : num(selectedDashboardCard["ISD"]);

  const osdTotal = hasAgingForSelectedDate
    ? num(latestOSD["Total"])
    : num(selectedDashboardCard["OSD"]);

  const totalParcels =
    isdTotal + osdTotal > 0
      ? isdTotal + osdTotal
      : dashboardTotal > 0
      ? dashboardTotal
      : trackingTotalInProgress;

  const zoneTransferData = getZoneTransferData(
    dashboardCard,
    selectedDateKey,
    totalParcels
  );

  const prevTotal = num(prevISD["Total"]) + num(prevOSD["Total"]);

  const prevZoneTransferData = getZoneTransferData(
    dashboardCard,
    prevDateKey,
    prevTotal || totalParcels
  );

  const zoneTransfer = zoneTransferData.value;
  const zoneTransferPct = zoneTransferData.pct;
  const prevZoneTransferPct = prevZoneTransferData.pct;

  const zoneTransferPctDiff = Math.abs(
    zoneTransferPct - prevZoneTransferPct
  ).toFixed(2);

  const zoneTransferPctIncreased = zoneTransferPct > prevZoneTransferPct;

  const zoneTransferPctDeltaText =
    prevZoneTransferPct > 0
      ? zoneTransferPctIncreased
        ? `${zoneTransferPctDiff}% increased`
        : `${zoneTransferPctDiff}% decreased`
      : "No previous data";

  const zoneTransferPctDeltaDir =
    prevZoneTransferPct > 0
      ? zoneTransferPctIncreased
        ? "good-up"
        : "bad-down"
      : "neutral";

  const fidLMH_ISD = num(selectedBacklog["FID LMH ISD"]);
  const fidLMH_SUB = num(selectedBacklog["FID LMH SUB"]);
  const fidLMH_OSD = num(selectedBacklog["FID LMH OSD"]);

  const fidFMH = num(selectedBacklog["FID FMH"]);
  const fidSort = num(selectedBacklog["FID Sort"]);

  const ridFMH_ISD = num(selectedBacklog["RID FMH ISD"]);
  const ridFMH_SUB = num(selectedBacklog["RID FMH SUB"]);
  const ridFMH_OSD = num(selectedBacklog["RID FMH OSD"]);

  const ridLMH_ISD = num(selectedBacklog["RID LMH ISD"]);
  const ridLMH_SUB = num(selectedBacklog["RID LMH SUB"]);
  const ridLMH_OSD = num(selectedBacklog["RID LMH OSD"]);

  const ridSort = num(selectedBacklog["RID LMH Sort"]);

  const sortMax = Math.max(fidSort, ridSort, 1);

  const hbarRegionMax = Math.max(
    isdTotal,
    osdTotal,
    trackingTotalInProgress,
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

      <div className="cards">
        <KPICard
          icon="📦"
          accent="navy"
          title="Total Parcels"
          value={fmt(totalParcels)}
        />

        <KPICard
          icon="📋"
          accent="crimson"
          title="Total Backlog"
          value={fmt(totalBacklog)}
        />

        <KPICard
          icon="📉"
          accent="amber"
          title="FID Backlog"
          value={fmt(fidBacklog)}
        />

        <KPICard
          icon="📊"
          accent="teal"
          title="RID Backlog"
          value={fmt(ridBacklog)}
        />
      </div>

      <div className="chartBox full">
        <div className="box-header">
          <span className="box-title">Region wise In-Process Parcels</span>
        </div>

        {hasAgingForSelectedDate ? (
          <>
            <HBar
              label="ISD"
              value={isdTotal}
              max={hbarRegionMax}
              color={NAVY}
            />

            <HBar
              label="OSD"
              value={osdTotal}
              max={hbarRegionMax}
              color={CRIMSON}
            />
          </>
        ) : (
          <HBar
            label="FID Total"
            value={trackingTotalInProgress}
            max={hbarRegionMax}
            color={NAVY}
          />
        )}
      </div>

      <div className="full">
        <div className="box-header">
          <span className="box-title">Backlog Details</span>

          <div className="legend">
            <span className="legend-item">
              <span className="legend-dot navy" />
              ISD
            </span>

            <span className="legend-item">
              <span className="legend-dot green" />
              SUB
            </span>

            <span className="legend-item">
              <span className="legend-dot crimson" />
              OSD
            </span>
          </div>
        </div>

        {hasBacklogForSelectedDate ? (
          <>
            <StackedBar
              label="FID LMH"
              isd={fidLMH_ISD}
              sub={fidLMH_SUB}
              osd={fidLMH_OSD}
            />

            <StackedBar label="FID FMH" isd={fidFMH} sub={0} osd={0} />

            <StackedBar
              label="RID LMH"
              isd={ridLMH_ISD}
              sub={ridLMH_SUB}
              osd={ridLMH_OSD}
            />

            <StackedBar
              label="RID FMH"
              isd={ridFMH_ISD}
              sub={ridFMH_SUB}
              osd={ridFMH_OSD}
            />
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

        {hasBacklogForSelectedDate ? (
          <>
            <HBar label="FID Sort" value={fidSort} max={sortMax} color={NAVY} />

            <HBar
              label="RID Sort"
              value={ridSort}
              max={sortMax}
              color={CRIMSON}
            />
          </>
        ) : (
          <p style={{ color: "#4a5980", fontWeight: 600 }}>
            Sort details are not available for {reportDate}.
          </p>
        )}
      </div>

      <div className="cards zone-transfer-row">
        <KPICard
          icon="🔄"
          accent="amber"
          title="Zone Transfer"
          value={fmt(zoneTransfer)}
        />

        <KPICard
          icon="📉"
          accent="teal"
          title="Zone Transfer %"
          value={`${zoneTransferPct.toFixed(2)}%`}
          delta={zoneTransferPctDeltaText}
          deltaDir={zoneTransferPctDeltaDir}
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
                    <td key={bucket}>{fmt(latestISD[bucket])}</td>
                  ))}

                  <td className="total-col">{fmt(isdTotal)}</td>
                </tr>

                <tr className="pct-row">
                  <td className="row-label">%</td>

                  {BUCKETS.map((bucket) => (
                    <td key={bucket} style={{ color: TEAL, fontSize: "11px" }}>
                      {isdTotal
                        ? `${(
                            (num(latestISD[bucket]) / isdTotal) *
                            100
                          ).toFixed(1)}%`
                        : "—"}
                    </td>
                  ))}

                  <td className="total-col">100%</td>
                </tr>

                <tr className="osd-row">
                  <td className="row-label osd">OSD</td>

                  {BUCKETS.map((bucket) => (
                    <td key={bucket}>{fmt(latestOSD[bucket])}</td>
                  ))}

                  <td className="total-col">{fmt(osdTotal)}</td>
                </tr>

                <tr className="pct-row">
                  <td className="row-label">%</td>

                  {BUCKETS.map((bucket) => (
                    <td key={bucket} style={{ color: TEAL, fontSize: "11px" }}>
                      {osdTotal
                        ? `${(
                            (num(latestOSD[bucket]) / osdTotal) *
                            100
                          ).toFixed(1)}%`
                        : "—"}
                    </td>
                  ))}

                  <td className="total-col">100%</td>
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
            <span className="legend-item">
              <span className="legend-dot navy" />
              Total In Progress
            </span>

            <span className="legend-item">
              <span className="legend-dot green" />
              Worked On
            </span>
          </div>
        </div>

        <div className="cool-chart-inner">
          <ResponsiveContainer width="100%" height={330}>
            <AreaChart
              data={trendData}
              margin={{ top: 12, right: 24, left: 0, bottom: 4 }}
            >
              <defs>
                <linearGradient
                  id="totalProgressGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor={NAVY} stopOpacity={0.32} />
                  <stop offset="95%" stopColor={NAVY} stopOpacity={0.02} />
                </linearGradient>

                <linearGradient
                  id="workedOnGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
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
                dot={{
                  r: 4,
                  strokeWidth: 3,
                  fill: "#ffffff",
                  stroke: NAVY,
                }}
                activeDot={{
                  r: 7,
                  strokeWidth: 3,
                  fill: "#ffffff",
                  stroke: NAVY,
                }}
                connectNulls={false}
              />

              <Area
                type="monotone"
                dataKey="workedOn"
                name="Worked On"
                stroke={GREEN}
                strokeWidth={3}
                fill="url(#workedOnGradient)"
                dot={{
                  r: 4,
                  strokeWidth: 3,
                  fill: "#ffffff",
                  stroke: GREEN,
                }}
                activeDot={{
                  r: 7,
                  strokeWidth: 3,
                  fill: "#ffffff",
                  stroke: GREEN,
                }}
                connectNulls={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="tableBox full">
        <div className="box-header">
          <span className="box-title">
            Date-wise Backlog Progress Tracking (FID)
          </span>
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
              const isSelected =
                getDateKey(row["Report Date"]) === selectedDateKey;

              return (
                <tr key={index} className={isSelected ? "highlight-row" : ""}>
                  <td style={{ textAlign: "left", fontWeight: 600 }}>
                    {toDateLabel(row["Report Date"])}
                  </td>

                  <td>{fmt(row["Newly Added"])}</td>

                  <td>{fmt(row["Total In Progress (Backlog)"])}</td>

                  <td>
                    {!isBlank(row["Worked On"]) ? fmt(row["Worked On"]) : "—"}
                  </td>

                  <td>
                    {!isBlank(row["Carry Forward"])
                      ? fmt(row["Carry Forward"])
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="aging-rule-note">
          <strong>Aging Rule:</strong> ISD &amp; SUB = 4 Days+ || OSD = 5 Days+
        </div>
      </div>
    </div>
  );
}

export default App;