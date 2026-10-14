# Prompt for a frontend AI (paste everything below the line)

---

Build a professional, data-dense monitoring dashboard for Databricks pipelines using **React 18 + Vite** (JavaScript or TypeScript). Use plain CSS or Tailwind and one chart library (Recharts). No Streamlit, no backend work. Replace `frontend/src/App.jsx` and `style.css`; keep `vite.config.js` (it proxies `/api` to `http://127.0.0.1:8000`).

## Purpose
Show the health of every pipeline (Databricks job). When a run fails, clicking it opens a detailed incident report **in a separate section below the runs list** (not a side panel, not a modal). Light and dark theme via `prefers-color-scheme`. Works at 375px width and up. Accessible (keyboard, contrast, aria labels).

## API (already built, do not invent fields)
`GET /api/stats` returns:
```
{ overall:{runs,succeeded,failed,other,success_rate,avg_duration_seconds,max_duration_seconds},
  by_state:{SUCCESS:n,FAILED:n,...},
  jobs:[{job_id,job_name,runs,succeeded,failed,other,success_rate,avg_duration_seconds,max_duration_seconds,
         last_run:{run_id,status,started}, last_failure:{run_id,started}|null, recent_statuses:["SUCCESS","FAILED",...]}],
  daily:[{date,succeeded,failed}], note:string }
```
`success_rate` and `avg_duration_seconds` can be `null`; show "n/a", never 0.
`GET /api/runs` returns `{count, runs:[{run_id,job_id,job_name,status,lifecycle_state,start_time,end_time,duration_seconds,duration_formatted,error_message,tasks_count,source}]}`.
`GET /api/report/{run_id}` returns:
```
{ job:{id,name}, run:{id,status,lifecycle,source,started,ended,duration,queued|null},
  failure:{reason,reason_recorded,type|null},
  failed_tasks:[{task,state,attempts,started,ended,duration,depends_on[],error}],
  skipped_tasks:[task], tasks:[same shape as failed_tasks],
  history:{runs,succeeded,failed,last_success:{run_id,started}|null,same_error_before,same_error_run_ids[],other_failures:[{run_id,started}]},
  markdown:string }
```
`GET /api/report/{run_id}/references` (call it after the report renders; the first call can take several seconds while the embedding model loads, so show a spinner) returns:
```
{ status:"ok"|"no_match"|"no_error_text"|"unavailable", note:string,
  items:[{doc_id,chunk_id,title,doc_type,source,score,linked_to_run,snippet}] }
```
`POST /api/runs/refresh` pulls live data from Databricks (button: "Refresh from Databricks", show loading and error states).
Statuses seen: SUCCESS, FAILED, TIMED_OUT, CANCELLED, SKIPPED, UNKNOWN. Treat FAILED/TIMED_OUT/CANCELLED as bad, UNKNOWN as neutral grey (not green).

## Layout, top to bottom
1. **Header**: title, data source badge ("live" or "mock"), last refreshed, Refresh button.
2. **KPI row** (from `overall`): Total runs, Success rate, Failed runs, Avg duration, Longest run. Failed in red only when > 0.
3. **Charts row**: (a) stacked bar of succeeded/failed per day from `daily`; (b) donut of `by_state`; (c) bar of success rate per job. Label axes and units. Do not rely on colour alone.
4. **Pipelines table** (from `jobs`): job name, runs, success rate (small bar), failed, avg duration, last run status, last failure time, and a sparkline of `recent_statuses` (one coloured cell per run). Sorted by failures. Clicking a row filters the runs list to that job.
5. **Runs list**: columns job, run ID (monospace), status badge, started, duration. Filters: All / Failed / Succeeded, job dropdown, text search by run ID. Failed rows are clickable (cursor, hover, focus ring, Enter key); others are not. The selected row is highlighted.
6. **Incident report section, directly below the runs list**, rendered only after a failed run is clicked, with smooth scroll to it and a close button:
   - Title bar: job name, run ID, red FAILED badge, "Download .md" (use `markdown` from the API), "Copy" button.
   - **Pipeline / job** card: job name and ID, run ID, status and lifecycle, started, ended, duration (and queued time if present), data source.
   - **Reason for failure** card, most prominent: error type chip if `failure.type`, then the verbatim `failure.reason` in a monospace block with wrap and a copy button. If `reason_recorded` is false show a neutral "No error text was recorded" note, never invent a cause.
   - **Task breakdown** table from `tasks` (task, state badge, attempts, duration, depends on); highlight failed rows; show "retried N times" for attempts > 1. List `skipped_tasks` under "Not run because of this failure".
   - **Job history** card: runs on record, succeeded vs failed, last success before this run, "same error seen before: N earlier runs" with the run IDs, and the other failures in this job.
   - **Reference documents** card (from the references endpoint): title "Similar past documents (retrieved, not a diagnosis)". One row per item: doc_id, title, doc_type chip, source chip (flag "mock" as sample data), score, a "linked to this run" badge when `linked_to_run`, and the snippet. Show `note` under the list. Handle status `no_match`, `no_error_text` and `unavailable` with a neutral message.
7. Footer: show `note` from `/api/stats` (duration includes queue time).

## Rules
- Show only data the API returns. No AI-generated text, no fake numbers, no placeholder charts. Empty state for each section.
- Loading skeletons, error banner when the backend is unreachable ("Backend unreachable, is `python server.py` running?").
- Format durations as `2m15s`, times in the viewer's locale, run IDs in monospace.
- Professional look: restrained palette, one accent, red/amber/green only for status, consistent 8px spacing, cards with subtle borders, no emoji.
- Deliver: the full source files, and `npm install && npm run dev` must work.
