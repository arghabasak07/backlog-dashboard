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
  if (value === null || value === undefined || value === "") return "—";
  return fmt(value);
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
            className="stacked-bar-segment seg-isd"
            style={{ width: `${pISD}%` }}
          >
            {pISD > 9 ? fmt(isd) : ""}
          </div>
        )}

        {!isBlank(sub) && num(sub) > 0 && (
          <div
            className="stacked-bar-segment seg-sub"
            style={{ width: `${pSUB}%` }}
          >
            {pSUB > 9 ? fmt(sub) : ""}
          </div>
        )}

        {!isBlank(osd) && num(osd) > 0 && (
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

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_URL}?t=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`API request failed: HTTP ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Apps Script API returned an error");
      }

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

  const trackingTotalInProgress = !isBlank(
    selectedTracking["Total In Progress (Backlog)"]
  )
    ? num(selectedTracking["Total In Progress (Backlog)"])
    : null;

  const dashboardTotal = !isBlank(selectedDashboardCard["Total"])
    ? num(selectedDashboardCard["Total"])
    : null;

  const fidBacklog = !isBlank(selectedBacklog["FID Backlog"])
    ? num(selectedBacklog["FID Backlog"])
    : null;

  const ridBacklog = !isBlank(selectedBacklog["RID Backlog"])
    ? num(selectedBacklog["RID Backlog"])
    : null;

  const totalBacklog =
    fidBacklog !== null || ridBacklog !== null
      ? num(fidBacklog) + num(ridBacklog)
      : null;

  const isdTotal = hasAgingForSelectedDate
    ? num(latestISD["Total"])
    : !isBlank(selectedDashboardCard["ISD"])
    ? num(selectedDashboardCard["ISD"])
    : null;

  const osdTotal = hasAgingForSelectedDate
    ? num(latestOSD["Total"])
    : !isBlank(selectedDashboardCard["OSD"])
    ? num(selectedDashboardCard["OSD"])
    : null;

  const totalParcels =
    isdTotal !== null || osdTotal !== null
      ? num(isdTotal) + num(osdTotal)
      : dashboardTotal !== null
      ? dashboardTotal
      : null;

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

  const zoneTransferPctHasDelta =
    zoneTransferPct !== null && prevZoneTransferPct !== null && prevZoneTransferPct > 0;

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
      ? "good-up"
      : "bad-down"
    : "";

  const fidLMH_ISD = selectedBacklog["FID LMH ISD"];
  const fidLMH_SUB = selectedBacklog["FID LMH SUB"];
  const fidLMH_OSD = selectedBacklog["FID LMH OSD"];

  const fidFMH = selectedBacklog["FID FMH"];
  const fidSort = selectedBacklog["FID Sort"];

  const ridFMH_ISD = selectedBacklog["RID FMH ISD"];
  const ridFMH_SUB = selectedBacklog["RID FMH SUB"];
  const ridFMH_OSD = selectedBacklog["RID FMH OSD"];

  const ridLMH_ISD = selectedBacklog["RID LMH ISD"];
  const ridLMH_SUB = selectedBacklog["RID LMH SUB"];
  const ridLMH_OSD = selectedBacklog["RID LMH OSD"];

  const ridSort = selectedBacklog["RID LMH Sort"];

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

      <div className="cards">
        <KPICard
          icon="📦"
          accent="navy"
          title="Total Parcels"
          value={fmtMaybe(totalParcels)}
        />

        <KPICard
          icon="📋"
          accent="crimson"
          title="Total Backlog"
          value={fmtMaybe(totalBacklog)}
        />

        <KPICard
          icon="📉"
          accent="amber"
          title="FID Backlog"
          value={fmtMaybe(fidBacklog)}
        />

        <KPICard
          icon="📊"
          accent="teal"
          title="RID Backlog"
          value={fmtMaybe(ridBacklog)}
        />
      </div>

      <div className="chartBox full">
        <div className="box-header">
          <span className="box-title">Region wise In-Process Parcels</span>
        </div>

        {isdTotal !== null || osdTotal !== null ? (
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
          <p style={{ color: "#4a5980", fontWeight: 600 }}>
            Region-wise data is not available for {reportDate}.
          </p>
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

            <StackedBar label="FID FMH" isd={fidFMH} sub="" osd="" />

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

        {!isBlank(fidSort) || !isBlank(ridSort) ? (
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
          value={fmtMaybe(zoneTransfer)}
        />

        <KPICard
          icon="📉"
          accent="teal"
          title="Zone Transfer %"
          value={zoneTransferPct !== null ? `${zoneTransferPct.toFixed(2)}%` : "—"}
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
                    <td key={bucket}>{fmtMaybe(latestISD[bucket])}</td>
                  ))}

                  <td className="total-col">{fmtMaybe(isdTotal)}</td>
                </tr>

                <tr className="pct-row">
                  <td className="row-label">%</td>

                  {BUCKETS.map((bucket) => (
                    <td key={bucket} style={{ color: TEAL, fontSize: "11px" }}>
                      {!isBlank(latestISD[bucket]) && isdTotal
                        ? `${(
                            (num(latestISD[bucket]) / isdTotal) *
                            100
                          ).toFixed(1)}%`
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
                        ? `${(
                            (num(latestOSD[bucket]) / osdTotal) *
                            100
                          ).toFixed(1)}%`
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

                  <td>{fmtMaybe(row["Newly Added"])}</td>

                  <td>{fmtMaybe(row["Total In Progress (Backlog)"])}</td>

                  <td>{fmtMaybe(row["Worked On"])}</td>

                  <td>{fmtMaybe(row["Carry Forward"])}</td>
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