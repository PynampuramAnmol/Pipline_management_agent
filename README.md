# Databricks Pipeline Monitoring Assistant (Custom RAG)

Reads job runs from Databricks (read-only), shows pipeline statistics on a dashboard, and builds an
incident report for every failed run. The report comes only from recorded run data. No model is on
the report path, so nothing in it is guessed.

## Architecture
| Layer | What | Where |
|---|---|---|
| Monitoring (deterministic) | run records, counts, failures, history, stats | `src/monitoring/` |
| Incident report (deterministic) | job, run, tasks, reason, job history | `src/reporting/brief_report.py` |
| Retrieval (custom RAG, NumPy) | chunking, embeddings, cosine search | `src/ingestion/`, `src/retrieval/` |
| Generation (LLM, optional) | local Ollama, used only by the chat/ask path | `src/generation/`, `src/routing/` |
| API | FastAPI | `server.py` |
| UI | React + Vite | `frontend/` |

Failure reason = the error text Databricks recorded for the run/task, shown verbatim. If none was recorded,
the report says so.

## Run
```
python3 -m venv .venv && source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env        # set DATABRICKS_HOST and DATABRICKS_TOKEN (read access only)
python server.py            # API on http://127.0.0.1:8000
cd frontend && npm install && npm run dev   # UI on http://localhost:5173
```
Without a live snapshot the app shows mock sample data. "Refresh from Databricks" pulls runs through the Jobs API
(GET only) and saves `data/live/runs_snapshot.json` (gitignored).

## API
- `GET /api/runs`, `GET /api/summary`, `GET /api/stats`
- `GET /api/report/{run_id}` returns JSON plus `markdown`
- `GET /api/report/{run_id}/references`: custom-RAG reference documents for the run's error text (similar past docs, not a diagnosis)
- `GET /api/report/{run_id}/insights`: RAG-driven category, suggested checks (quoted from runbooks) and novelty flag
- `POST /api/runs/refresh` pulls live runs
- `GET /api/sample-data/presets`: returns built-in incident simulation presets
- `GET /api/sample-data/preset/{preset_id}`: returns specific preset runs
- `POST /api/sample-data/process`: runs 5-stage ingestion, metrics, clustering, RAG match, and scorecard synthesis
- `POST /api/sample-data/apply`: promotes processed sample runs to active dashboard telemetry
- `POST /api/chat`, `GET /api/incident-report/{run_id}`: optional LLM paths (need local Ollama)

## Tests and evaluation
```
python -m pytest -q                                        # unit tests (no model download)
python -m src.evaluation.retrieval_metrics --embedder hashing   # offline lexical: hit@k, MRR, threshold sweep, baselines
python -m src.evaluation.retrieval_metrics --embedder real      # pretrained embedder (downloads on first use)
```
The retrieval set is 10 hand-labelled queries plus 5 negatives with no relevant document. It is a smoke check, not a benchmark. The hashing embedder is lexical
only, and the queries share words with the documents, so its score is optimistic. Measure `--embedder real` before
quoting any number.

## What RAG decides
Retrieved documents drive three things in the report (no model, nothing generated):
- **Category**: the `category:` header of the matched document (linked to the run by metadata, else by similarity above a cutoff).
- **Suggested checks**: lines quoted verbatim from matching troubleshooting runbooks, with document ID and score.
- **Novelty**: flagged when nothing in the corpus is close and the exact error was not seen in earlier runs of the job.

Cutoffs are provisional (`RAG_CATEGORY_MIN_SCORE` 0.60, `RAG_CHECKS_MIN_SCORE` 0.55, `RAG_NOVELTY_MAX_SCORE` 0.45).
Run `--embedder real`, read the threshold sweep (it includes negative queries with no relevant document), then set
the env vars. Documents get a category with an optional `category:` header line.

## Known limits
- Duration includes queue time.
- Databricks result states other than SUCCESS/FAILED are mapped but unverified against real data.
- The diagnostic documents are mock samples, not written about your real runs.
- The chat/LLM path is unverified generation. Treat its output as hypotheses.

## Sample Data Upload & Multi-Stage Processing Pipeline

Upload custom telemetry or simulate real-world failure scenarios with 1-click presets to inspect the entire multi-stage data processing lifecycle in real-time.

### Processing Stages:
1. **Ingestion & Schema Validation**: Parses JSON, verifies Databricks `RunRecord` schemas, deduplicates keys `(job_id, run_id)`, and logs malformed/dropped entries.
2. **Telemetry Aggregation & Metrics**: Computes success rates, total/average/P95 durations, job distributions, and task hierarchies.
3. **Error Clustering & Anomaly Detection**: Groups repeated error messages into semantic categories (`Schema Mismatch`, `Cluster Resource & OOM`, `Timeouts`, `Permissions`) and detects incident spikes.
4. **Diagnostic Knowledge & RAG Matching**: Cross-references failure signatures against runbooks in `data/diagnostic_documents/` and resolution history, computing match confidence scores and suggested checklist items.
5. **Final Output & Synthesis**: Produces a Composite Health Scorecard (0–100, `OPTIMAL` / `DEGRADED` / `CRITICAL`), executive summary, and actionable remediation guide.

### 1-Click Incident Simulation Presets:
- **Standard Baseline Operations**: Normal multi-pipeline execution across orders ingest and daily aggregations.
- **Cascading Schema Incident**: `AnalysisException` caused by column rename (`order_total` -> `order_amount`) cascading into downstream analytics marts.
- **Cluster Memory & Executor OOM**: Spark executors killed by YARN for exceeding memory limits and JVM heap space exhaustion.
- **Dirty Ingestion Batch**: Evaluates validation and deduplication by intentionally including duplicate runs and malformed schemas.

### Telemetry Staging:
Click **"Apply This Dataset to Live Dashboard Telemetry"** from the final output panel to immediately promote the processed sample batch into the live dashboard, synchronizing all KPI cards, charts, pipelines table, and incident reports.

## Resolution memory (RAG learning)

On any incident, write how it was fixed and click **Mark resolved**. The note is saved as a document in `data/resolutions/` (git-ignored), embedded, and indexed. When a similar failure happens later, the Insights card shows "Similar failures marked resolved before" with the note.

- `POST /api/report/{run_id}/resolve` body `{"note": "...", "category": "optional"}`
- `GET|DELETE /api/report/{run_id}/resolution`
- Cutoff: `RAG_RESOLUTION_MIN_SCORE` (default 0.60). Lower it if differently worded errors do not match.
- Resolution docs omit `claim` and `run_id` on purpose, so they never conflict with run status.

## Dashboard Features: Incidents, Recovery, RAG Panel & Pipeline Visualizer
- **Sample Data Pipeline Visualizer**: Interactive stepper showing stage progress, status badges, milliseconds elapsed, and line-by-line audit logs.
- **Open incidents / Time to recover** tiles (`/api/stats` -> `incidents`). Incident = a streak of bad runs of one job. Open = the job's latest run is still bad. Time to recover = first bad run's start to the next success's start.
- **RAG knowledge base** card (`GET /api/rag/status`): documents, chunks, saved fixes, failed runs with a fix on record.
- **Report summary strip**: Status (Open / Resolved / Recovered), Category, times seen, fix on record, and the fix note on top.
- **Job timeline** and a "Recovered after ..." line in Job history (`history.timeline`, `history.recovered_by`).
- **RAG fixes**: a run's own saved note no longer appears as a "similar document" or feeds the novelty score. Suggested checks come only from runbooks of the detected category (`checks_note` explains an empty list).
