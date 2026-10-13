import React, { useState } from "react";

export default function App() {
  const [runId, setRunId] = useState("437531692562553");
  const [report, setReport] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchReport = async () => {
    if (!runId.trim()) return;
    setLoading(true);
    setError("");
    setReport("");

    try {
      const res = await fetch(`http://localhost:5001/api/report/${runId.trim()}`);
      if (!res.ok) {
        throw new Error(`Server status ${res.status}`);
      }
      const data = await res.json();
      if (data && data.report) {
        // Strip progress bars or HF warnings if present
        let cleaned = data.report
          .replace(/Loading weights:[\s\S]*?it\/s\]/g, "")
          .replace(/Warning: You are sending unauthenticated requests[\s\S]*?downloads\./g, "")
          .trim();

        setReport(cleaned);
      } else {
        setError("No report content returned from server.");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to connect to backend server on port 5001.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Databricks Pipeline Monitoring Assistant</h1>
        <p style={styles.subtitle}>RAG-Driven Job Failure Diagnostics & Verification</p>
      </header>

      <main style={styles.main}>
        <div style={styles.searchBox}>
          <input
            type="text"
            value={runId}
            onChange={(e) => setRunId(e.target.value)}
            placeholder="Enter Run ID (e.g., 437531692562553)"
            style={styles.input}
          />
          <button onClick={fetchReport} disabled={loading} style={styles.button}>
            {loading ? "Executing RAG Analysis..." : "Generate Report"}
          </button>
        </div>

        {error && (
          <div style={styles.errorBanner}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {report && (
          <div style={styles.reportContainer}>
            <h2 style={styles.reportHeading}>Diagnostic Report Output</h2>
            <pre style={styles.reportContent}>{report}</pre>
          </div>
        )}
      </main>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    backgroundColor: "#0f172a",
    color: "#f8fafc",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    padding: "2rem 1rem",
  },
  header: {
    maxWidth: "900px",
    margin: "0 auto 2rem auto",
    textAlign: "center",
  },
  title: {
    fontSize: "2rem",
    fontWeight: "700",
    color: "#38bdf8",
    marginBottom: "0.5rem",
  },
  subtitle: {
    color: "#94a3b8",
    fontSize: "1rem",
  },
  main: {
    maxWidth: "900px",
    margin: "0 auto",
  },
  searchBox: {
    display: "flex",
    gap: "1rem",
    marginBottom: "2rem",
  },
  input: {
    flex: 1,
    padding: "0.75rem 1rem",
    borderRadius: "6px",
    border: "1px solid #334155",
    backgroundColor: "#1e293b",
    color: "#f8fafc",
    fontSize: "1rem",
    outline: "none",
  },
  button: {
    padding: "0.75rem 1.5rem",
    borderRadius: "6px",
    border: "none",
    backgroundColor: "#0284c7",
    color: "#ffffff",
    fontWeight: "600",
    fontSize: "1rem",
    cursor: "pointer",
  },
  errorBanner: {
    backgroundColor: "#450a0a",
    border: "1px solid #dc2626",
    color: "#fca5a5",
    padding: "1rem",
    borderRadius: "6px",
    marginBottom: "1.5rem",
  },
  reportContainer: {
    backgroundColor: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "8px",
    padding: "1.5rem",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
  },
  reportHeading: {
    fontSize: "1.25rem",
    fontWeight: "600",
    color: "#38bdf8",
    marginBottom: "1rem",
    borderBottom: "1px solid #334155",
    paddingBottom: "0.5rem",
  },
  reportContent: {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: "0.9rem",
    lineHeight: "1.6",
    color: "#e2e8f0",
  },
};