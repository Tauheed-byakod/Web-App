# CivicGaps

**Report it. Track it. Make them fix it.**

CivicGaps is a local-first municipal issue reporting and public accountability demo for Metro City. Residents can place issues on a live map, follow a public response timeline, support community priorities and receive status updates. Department and ward performance is visible on a public scorecard.

## Features

- Photo-supported issue reporting, map pinning, geolocation and nearest-ward assignment.
- OpenStreetMap exploration map with clustered, status-colored markers, filters and list view.
- Nearby duplicate hints within 100 metres for the same category.
- Public issue timelines, category-specific SLA badges, response/resolution metrics and comments.
- Department and ward leaderboards with a documented Accountability Score, service-time charts and overdue backlog.
- Five monthly priority votes per citizen, validated on the server, plus an official priority queue.
- Persistent notifications delivered in real time to reporters and issue supporters.
- Citizen points, badges and a contributor leaderboard.
- Citizen, department official and administrator dashboards; an interactive Demo Mode panel.
- Responsive interface, dark mode and local demo accounts. No paid services or API keys.

## Architecture

```text
┌─────────────────────────────────────┐
│ React 18 + Vite                     │
│ Router · Tailwind · Recharts        │
│ React-Leaflet · Socket.IO client    │
└─────────────────┬───────────────────┘
                  │ REST / Socket.IO
┌─────────────────▼───────────────────┐
│ Express API + JWT role middleware   │
│ Zod validation · Multer uploads     │
└───────────────┬─────────────────────┘
                │
┌───────────────▼─────────────────────┐
│ SQLite (better-sqlite3)             │
│ schema auto-created · seeded demo   │
└─────────────────────────────────────┘
```

The database and generated/uploaded image files live under `server/data/` and `server/uploads/`. The schema is applied automatically whenever the server starts.

## Setup

Requirements: Node.js 20 LTS or newer and npm.

From the project root:

```powershell
npm run install:all
Copy-Item .env.example server\.env
npm run seed
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The API health check is at [http://localhost:4000/api/health](http://localhost:4000/api/health).

`npm run seed` is repeatable and resets the demo database to its seeded state. Starting the API without running the seed still creates an empty database with the full schema. `JWT_SECRET` can be changed in `server\.env`; the shipped fallback secret is intended for local demos only. Uploaded photos are limited to 5 MB.

## Demo logins

All demo accounts use password **`demo123`**:

| Role | Email | Demo scope |
|---|---|---|
| Citizen | `citizen@demo.com` | Report, support, vote, profile and notifications |
| Official | `official@demo.com` | Roads department priority queue and status updates |
| Admin | `admin@demo.com` | Citywide queue and department reassignment |

There are also 29 additional citizen accounts and four additional department officials in the seed data.

## Five-minute presentation walkthrough

1. **Start at the landing page (30 sec).** Point out live city counts, the map and the public performance preview.
2. **Explore the map (45 sec).** Filter by category/status, switch to list view and open a seeded report. Show its ward, SLA badge and public status timeline.
3. **Report an issue (60 sec).** Sign in as the citizen, open Report, choose a category, click the map (or allow geolocation), and submit a short report. Show the nearby duplicate hint and automatic ward assignment.
4. **Show public accountability (60 sec).** Open Accountability. Switch department/ward and time filters; explain the scorecard formula and point out the overdue backlog and charts.
5. **Show community priorities (45 sec).** Open Priorities and explain the server-enforced five-vote monthly limit. The seeded issue queue is also visible on the official dashboard.
6. **Demonstrate real-time response (60 sec).** Open CivicGaps in a second browser window and sign in as `citizen@demo.com`. In the first window use the floating Demo Mode panel to sign in as Official, then select **Simulate live status update**. The first seeded report belongs to Asha Rao and is assigned to Roads; the citizen window receives the persisted status notification live.
7. **Close on impact (20 sec).** Show the citizen profile’s points/badges and reinforce the public timeline: each report remains accountable through resolution.

## Accountability Score

For each department or ward, each component is clamped to 0–100:

```text
25% × response speed   (100 − average response hours / 2)
25% × resolution speed (100 − average resolution hours / 12)
40% × resolution rate  (resolved reports / all reports × 100)
10% × SLA compliance   (1 − overdue open reports / all reports) × 100
```

If there is no response or resolution history yet, that speed component is neutral (50). SLA targets are 72 hours for potholes, 24 for water leaks, 48 for garbage and drainage, and 120 for streetlights and other issues.

## Future scope

- **SMS alerts:** opt-in SMS notifications for residents without app access.
- **AI duplicate detection:** image and location similarity suggestions to reduce duplicate reports.
- **Municipal API integration:** authenticated work-order creation and status synchronization with city systems.
