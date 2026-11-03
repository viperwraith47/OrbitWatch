# OrbitWatch — Satellite Pass Predictor

Predict when satellites (ISS, Tiangong, Hubble, etc.) fly over your location. Live orbital elements, SGP4 propagation, sky charts, and a 3D globe — all in the browser.

## Features

- **Pass Predictions** — AOS/LOS/TCA times, max elevation, azimuth, range, duration
- **Visibility Classification** — Naked-eye (dark sky + sunlit), twilight, daylight, eclipsed
- **3D Globe** — Real-time satellite positions (Three.js + SGP4), day/night shader, ground tracks, orbit ellipses
- **Sky Charts** — Polar azimuth/elevation plots with scrubbable timeline
- **Live TLE Data** — Fetched from CelesTrak via ReTLEctor mirror (3h cache), with bundled snapshot fallback
- **Location Search** — City geocoding (Open-Meteo) + presets + manual entry
- **Client-Side Propagation** — Globe runs at 60fps without React re-renders

## Stack

- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript
- **Runtime**: Node.js (npm)
- **Styling**: Tailwind CSS 4 + Radix UI primitives
- **3D**: Three.js (r187) + custom shaders
- **Orbital**: satellite.js (SGP4/SDP4)
- **State**: Zustand (persisted)
- **Data Fetching**: TanStack Query
- **DB**: Prisma + SQLite (User/Post models for future auth)

## Getting Started

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run db:generate

# Start dev server
npm run dev
```

Open http://localhost:3000

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server on port 3000 |
| `npm run build` | Production build (standalone output) |
| `npm start` | Run production server |
| `npm run lint` | ESLint |
| `npm run db:push` | Push schema to SQLite |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Run migrations |

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── passes/       # POST — predict passes for observer + satellites
│   │   ├── tle/          # GET — raw TLE lines for globe (client-side SGP4)
│   │   ├── satellites/   # GET — satellite groups or single NORAD lookup
│   │   └── geocode/      # GET — city search
│   ├── page.tsx          # Main UI (sidebar + results/globe tabs)
│   └── layout.tsx        # Root layout, fonts, providers
├── components/
│   ├── predictor/        # LocationCard, SatelliteCard, SettingsCard, ResultsPanel, PassCard, GlobePanel, SkyChart
│   └── ui/               # 18 Radix-based components (Button, Dialog, Select, etc.)
├── hooks/
│   ├── use-tle.ts        # TLE fetching + color palette
│   └── use-toast.ts      # Toast system
├── lib/
│   ├── sat/
│   │   ├── passes.ts     # Core pass-finding (30s scan → bisection → ternary TCA)
│   │   ├── tle-store.ts  # Cached live fetch + snapshot fallback
│   │   ├── tle-snapshot.ts # Bundled TLEs (auto-generated)
│   │   ├── astro.ts      # Sun elevation, shadow fraction
│   │   └── types.ts      # Shared types
│   └── format.ts         # Time/date/azimuth formatting
├── store/
│   └── useAppStore.ts    # Zustand: observer, selected sats, params
└── providers.tsx         # TanStack Query provider
```

## Data Sources

- **Live TLEs**: https://retlector.eu/{group}/3le (CelesTrak GP data via caching proxy)
- **Groups**: stations, visual, weather, science, amateur (~1200 satellites)
- **Fallback**: Bundled snapshot in `src/lib/sat/tle-snapshot.ts` (regenerate with `bun scripts/gen-tle-snapshot.mjs`)
- **Geocoding**: Open-Meteo API

## Pass Algorithm

1. **Coarse scan** — 30s steps over prediction window
2. **AOS/LOS refinement** — 8-iteration bisection on elevation zero-crossing
3. **TCA (max elevation)** — 34-iteration ternary search
4. **Visibility** — Sun elevation at observer + satellite shadow fraction (satellite.js)
   - `visible`: sun < −6° AND satellite sunlit
   - `twilight`: sun −6°..0° AND sunlit
   - `daylight`: sun ≥ 0°
   - `eclipsed`: satellite in shadow
5. **Adaptive sampling** — ≤600 points per pass for sky chart

## Globe Rendering

- **Coordinate system**: Earth-fixed ECEF → Three.js scene (x, z, -y)
- **Day/night shader**: Dual texture blend with terminator glow + atmospheric rim
- **Satellites**: Propagated each frame (SGP4), orbit ellipses rigid-rotated by GMST
- **Ground tracks**: Rebuilt every 60s wall time (±½ period)
- **Labels**: HTML overlays, occlusion-tested against Earth horizon
- **Telemetry push**: Throttled ~2 Hz to React (no re-render loop)

## Regenerating TLE Snapshot

```bash
# Requires pre-downloaded 3LE files at /tmp/ret_{group}.3le
bun scripts/gen-tle-snapshot.mjs
```

## Deployment

```bash
npm run build
# Output: .next/standalone/ (self-contained Node.js server)
# Copy .next/standalone + public/ to target
npm start
```

Docker example:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY .next/standalone ./
COPY public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

## License

MIT — orbital elements from CelesTrak (public domain), satellite.js (MIT)