import { useEffect, useState } from "react";
import Papa from "papaparse";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import "./App.css";

// ─── Google Sheets CSV Links ───────────────────────────────
const CSV_URLS = {
  tracking:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vTNmZarW4iJWdDABvQpiez3TGED1feDnvx3_8criK4OswQ3H664ixbgmeDXSfHLiA/pub?gid=82060104&single=true&output=csv",

  backlog:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vTNmZarW4iJWdDABvQpiez3TGED1feDnvx3_8criK4OswQ3H664ixbgmeDXSfHLiA/pub?gid=324731862&single=true&output=csv",

  aging:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vTNmZarW4iJWdDABvQpiez3TGED1feDnvx3_8criK4OswQ3H664ixbgmeDXSfHLiA/pub?gid=197936727&single=true&output=csv",
};

// ─── Helpers ───────────────────────────────────────────────
const num = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return value;

  const cleaned = String(value).replace(/,/g, "").replace(/%/g, "").trim();
  const parsed = Number(cleaned);

  return Number.isNaN(parsed) ? 0 : parsed;
};

const fmt = (n) => num(n).toLocaleString();
const fmtK = (v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v);

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

const NAVY = "#06164a";
const CRIMSON = "#c0152a";
const AMBER = "#f5a623";
const GREEN = "#1b8a4c";
const TEAL = "#0e9e8e";
const PURPLE = "#6b4fa6";

// ─── Sub-components ────────────────────────────────────────
const KPICard = ({ icon, title, value, delta, deltaDir, accent }) => (
  <div className={`card accent-${accent}`}>
    <div className="card-icon">{icon}</div>
    <h3>{title}</h3>
    <h2>{value}</h2>

    {delta && (
      <span className={`card-delta ${deltaDir}`}>
        {deltaDir === "down" ? "▼" : "▲"} {delta}
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
          width: max > 0 ? `${Math.min((value / max) * 100, 100)}%` : "0%",
          background: color,
        }}
      >
        {value > max * 0.18 ? fmt(value) : ""}
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

  return (
    <div className="custom-tooltip">
      <p className="tooltip-label">{label}</p>

      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          <span>{p.name}:</span>{" "}
          <strong>
            {p.value != null ? num(p.value).toLocaleString() : "—"}
          </strong>
        </p>
      ))}
    </div>
  );
};

// ─── Main App ──────────────────────────────────────────────
function App() {
  const [backlog, setBacklog] = useState([]);
  const [tracking, setTracking] = useState([]);
  const [aging, setAging] = useState([]);
  const [selectedDateKey, setSelectedDateKey] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [trackingRows, backlogRows, agingRows] = await Promise.all([
        fetchCSV(CSV_URLS.tracking),
        fetchCSV(CSV_URLS.backlog),
        fetchCSV(CSV_URLS.aging),
      ]);

      const cleanTrackingRows = trackingRows.filter(
        (r) => r["Report Date"] && r["Newly Added"] !== undefined
      );

      const cleanBacklogRows = backlogRows.filter(
        (r) => r["Date"] || r["FID Backlog"] !== undefined
      );

      const cleanAgingRows = agingRows.filter(
        (r) => r["Region"] === "ISD" || r["Region"] === "OSD"
      );

      setTracking(cleanTrackingRows);
      setBacklog(cleanBacklogRows);
      setAging(cleanAgingRows);

      const latest7Rows = cleanTrackingRows.slice(-7);
      const lastDateKey = getDateKey(
        latest7Rows[latest7Rows.length - 1]?.["Report Date"]
      );

      setSelectedDateKey((current) => {
        const latest7Keys = latest7Rows.map((r) => getDateKey(r["Report Date"]));

        if (current && latest7Keys.includes(current)) {
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
          Check whether your Google Sheets CSV links are published and
          accessible.
        </p>
      </div>
    );
  }

  // Latest 7 days only for dropdown, line chart, and bottom table
  const latest7Tracking = tracking.slice(-7);

  const dateOptions = uniqueByKey(
    latest7Tracking.map((row) => ({
      key: getDateKey(row["Report Date"]),
      label: toDateLabel(row["Report Date"]),
    }))
  );

  const selectedTrackingIndex = Math.max(
    tracking.findIndex(
      (row) => getDateKey(row["Report Date"]) === selectedDateKey
    ),
    0
  );

  const selectedTracking = tracking[selectedTrackingIndex] || {};
  const prevTracking = tracking[selectedTrackingIndex - 1] || {};

  const selectedBacklog =
    backlog.find((row) => getDateKey(row["Date"]) === selectedDateKey) || {};

  const prevBacklog =
    backlog
      .filter((row) => {
        const rowDateKey = getDateKey(row["Date"]);
        const rowIndex = tracking.findIndex(
          (r) => getDateKey(r["Report Date"]) === rowDateKey
        );
        return rowIndex >= 0 && rowIndex < selectedTrackingIndex;
      })
      .slice(-1)[0] || {};

  const hasBacklogForSelectedDate = Object.keys(selectedBacklog).length > 0;

  const selectedAgingRows = aging.filter(
    (r) => getDateKey(r["Report Date"]) === selectedDateKey
  );

  const latestISD =
    selectedAgingRows.filter((r) => r["Region"] === "ISD").slice(-1)[0] || {};

  const latestOSD =
    selectedAgingRows.filter((r) => r["Region"] === "OSD").slice(-1)[0] || {};

  const hasAgingForSelectedDate =
    Object.keys(latestISD).length > 0 || Object.keys(latestOSD).length > 0;

  const prevDateKey =
    selectedTrackingIndex > 0
      ? getDateKey(tracking[selectedTrackingIndex - 1]?.["Report Date"])
      : "";

  const prevAgingRows = aging.filter(
    (r) => getDateKey(r["Report Date"]) === prevDateKey
  );

  const prevISD =
    prevAgingRows.filter((r) => r["Region"] === "ISD").slice(-1)[0] || {};

  const prevOSD =
    prevAgingRows.filter((r) => r["Region"] === "OSD").slice(-1)[0] || {};

  const trackingTotalInProgress = num(
    selectedTracking["Total In Progress (Backlog)"]
  );

  const trackingCarryForward = num(selectedTracking["Carry Forward"]);

  const prevTrackingTotalInProgress = num(
    prevTracking["Total In Progress (Backlog)"]
  );

  const fidBacklog = hasBacklogForSelectedDate
    ? num(selectedBacklog["FID Backlog"])
    : trackingTotalInProgress;

  const ridBacklog = hasBacklogForSelectedDate
    ? num(selectedBacklog["RID Backlog"])
    : 0;

  const overallBacklog = hasBacklogForSelectedDate
    ? fidBacklog + ridBacklog
    : trackingTotalInProgress;

  const isdTotal = num(latestISD["Total"]);
  const osdTotal = num(latestOSD["Total"]);

  const totalInProcess = hasAgingForSelectedDate
    ? isdTotal + osdTotal
    : trackingTotalInProgress;

  const fidPct = totalInProcess ? (fidBacklog / totalInProcess) * 100 : 0;

  const prevTotal = num(prevISD["Total"]) + num(prevOSD["Total"]);

  const prevFID = hasBacklogForSelectedDate
    ? num(prevBacklog["FID Backlog"])
    : prevTrackingTotalInProgress;

  const prevFIDPct = prevTotal
    ? (prevFID / prevTotal) * 100
    : prevTrackingTotalInProgress
      ? 100
      : 0;

  const pctDelta = Math.abs(fidPct - prevFIDPct).toFixed(2);

  const carryForward = trackingCarryForward;

  const carryForwardPct = totalInProcess
    ? (carryForward / totalInProcess) * 100
    : 0;

  const fidDelta = Math.abs(fidBacklog - prevFID).toLocaleString();
  const fidDir = fidBacklog <= prevFID ? "down" : "up";

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
  const hbarRegionMax = Math.max(isdTotal, osdTotal, trackingTotalInProgress, 1);
  const hbarBacklogMax = Math.max(fidBacklog, ridBacklog, 1);

  const BUCKETS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, "10+"];

  const trendData = latest7Tracking.map((r) => ({
    date: toDateLabel(r["Report Date"]),
    "Newly Added": r["Newly Added"] !== "" ? num(r["Newly Added"]) : null,
    "Total In Prog":
      r["Total In Progress (Backlog)"] !== ""
        ? num(r["Total In Progress (Backlog)"])
        : null,
    "Worked On": r["Worked On"] !== "" ? num(r["Worked On"]) : null,
    "Carry Forward":
      r["Carry Forward"] !== "" ? num(r["Carry Forward"]) : null,
  }));

  const reportDate =
    toDateLabel(selectedTracking["Report Date"]) || "Selected Date";

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1>
            Backlog <span>Report</span>
          </h1>
          <p className="subtitle">
            {reportDate}
            <span className="divider" />
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
              onChange={(e) => setSelectedDateKey(e.target.value)}
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

          <span className="badge-threshold">⚠ ISD 3+ | OSD 4+ days</span>
        </div>
      </div>

      <div className="cards">
        <KPICard
          icon="📦"
          accent="navy"
          title="Total In-Process Parcels"
          value={fmt(totalInProcess)}
        />

        <KPICard
          icon="📋"
          accent="crimson"
          title="Overall Backlog"
          value={fmt(overallBacklog)}
        />

        <KPICard
          icon="🔄"
          accent="amber"
          title="Carry Forward"
          value={fmt(carryForward)}
        />

        <KPICard
          icon="📉"
          accent="teal"
          title="FID Backlog"
          value={fmt(fidBacklog)}
          delta={`${fidDelta} vs prev`}
          deltaDir={fidDir}
        />
      </div>

      <div className="pct-region-grid">
        <div className="pct-col">
          <div className="card highlight">
            <h3>FID Backlog %</h3>
            <div className="big-pct">{fidPct.toFixed(2)}%</div>
            <span className="card-delta down">▼ {pctDelta}% vs previous</span>
          </div>

          <div className="card" style={{ borderTop: `3px solid ${TEAL}` }}>
            <h3>Carry Forward %</h3>
            <div className="big-pct" style={{ color: TEAL }}>
              {carryForwardPct.toFixed(2)}%
            </div>
            <span className="card-delta down">▼ FID tracking source</span>
          </div>
        </div>

        <div className="bars-col">
          <div className="chartBox">
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

          <div className="chartBox">
            <div className="box-header">
              <span className="box-title">Backlog</span>
            </div>

            <HBar
              label="FID Backlog"
              value={fidBacklog}
              max={hbarBacklogMax}
              color={NAVY}
            />

            {hasBacklogForSelectedDate && (
              <HBar
                label="RID Backlog"
                value={ridBacklog}
                max={hbarBacklogMax}
                color={CRIMSON}
              />
            )}
          </div>
        </div>
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
                  {BUCKETS.map((b) => (
                    <th key={b}>{b}</th>
                  ))}
                  <th>Total</th>
                </tr>
              </thead>

              <tbody>
                <tr className="isd-row">
                  <td className="row-label isd">ISD</td>
                  {BUCKETS.map((b) => (
                    <td key={b}>{fmt(latestISD[b])}</td>
                  ))}
                  <td className="total-col">{fmt(isdTotal)}</td>
                </tr>

                <tr className="pct-row">
                  <td className="row-label">%</td>
                  {BUCKETS.map((b) => (
                    <td key={b} style={{ color: TEAL, fontSize: "11px" }}>
                      {isdTotal
                        ? `${((num(latestISD[b]) / isdTotal) * 100).toFixed(
                            1
                          )}%`
                        : "—"}
                    </td>
                  ))}
                  <td className="total-col">100%</td>
                </tr>

                <tr className="osd-row">
                  <td className="row-label osd">OSD</td>
                  {BUCKETS.map((b) => (
                    <td key={b}>{fmt(latestOSD[b])}</td>
                  ))}
                  <td className="total-col">{fmt(osdTotal)}</td>
                </tr>

                <tr className="pct-row">
                  <td className="row-label">%</td>
                  {BUCKETS.map((b) => (
                    <td key={b} style={{ color: TEAL, fontSize: "11px" }}>
                      {osdTotal
                        ? `${((num(latestOSD[b]) / osdTotal) * 100).toFixed(
                            1
                          )}%`
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
            Aging distribution data is not available for {reportDate}. KPI
            values are using FID_Tracking.
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

            <StackedBar label="FID FMH" isd={fidFMH} sub={0} osd={0} />

            <StackedBar
              label="RID FMH"
              isd={ridFMH_ISD}
              sub={ridFMH_SUB}
              osd={ridFMH_OSD}
            />

            <StackedBar
              label="RID LMH"
              isd={ridLMH_ISD}
              sub={ridLMH_SUB}
              osd={ridLMH_OSD}
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

      <div className="chartBox full">
        <div className="box-header">
          <span className="box-title">Date-wise FID Progress Tracking</span>

          <div className="legend">
            <span className="legend-item">
              <span className="legend-dot" style={{ background: AMBER }} />
              Newly Added
            </span>
            <span className="legend-item">
              <span className="legend-dot navy" />
              Total In Prog
            </span>
            <span className="legend-item">
              <span className="legend-dot green" />
              Worked On
            </span>
            <span className="legend-item">
              <span className="legend-dot crimson" />
              Carry Forward
            </span>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={trendData}
            margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#dce3f0" />
            <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#4a5980" }} />
            <YAxis
              tick={{ fontSize: 11, fill: "#8a97b8" }}
              tickFormatter={fmtK}
            />
            <Tooltip content={<CustomTooltip />} />

            <Line
              type="monotone"
              dataKey="Newly Added"
              stroke={AMBER}
              strokeWidth={2.5}
              dot={{ r: 4 }}
              connectNulls={false}
            />

            <Line
              type="monotone"
              dataKey="Total In Prog"
              stroke={NAVY}
              strokeWidth={2.5}
              dot={{ r: 4 }}
              connectNulls={false}
            />

            <Line
              type="monotone"
              dataKey="Worked On"
              stroke={GREEN}
              strokeWidth={2.5}
              dot={{ r: 4 }}
              connectNulls={false}
            />

            <Line
              type="monotone"
              dataKey="Carry Forward"
              stroke={CRIMSON}
              strokeWidth={2.5}
              dot={{ r: 4 }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
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
            {latest7Tracking.map((row, i) => {
              const isSelected =
                getDateKey(row["Report Date"]) === selectedDateKey;

              return (
                <tr key={i} className={isSelected ? "highlight-row" : ""}>
                  <td style={{ textAlign: "left", fontWeight: 600 }}>
                    {toDateLabel(row["Report Date"])}
                  </td>

                  <td>{fmt(row["Newly Added"])}</td>

                  <td>{fmt(row["Total In Progress (Backlog)"])}</td>

                  <td>
                    {row["Worked On"] !== "" ? fmt(row["Worked On"]) : "—"}
                  </td>

                  <td>
                    {row["Carry Forward"] !== ""
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