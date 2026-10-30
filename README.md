# RESQ – Emergency Response & Coordination Platform

MERN app: React 19 + TypeScript + Vite (frontend) · Express 5 + Mongoose (backend) · MongoDB · Socket.IO · Leaflet/OpenStreetMap · OSRM routing.
**University demonstration project – not an official emergency service.**

## Run locally
```bash
# backend
cd backend && cp .env.example .env      # fill MONGO_URI and JWT_SECRET (keep your existing .env if you have one)
npm install
npm run create-admin                    # uses ADMIN_* from .env
npm run dev                             # http://localhost:5000

# frontend
cd frontend/vite-project && cp .env.example .env
npm install && npm run dev              # http://localhost:5173
```
Geolocation needs HTTPS or `localhost`. If the frontend runs on another origin set `CLIENT_ORIGIN` in the backend `.env`.

## Demo script (4 browsers/profiles or one normal + private windows)
1. Register a `unit` and a `hospital` account and a normal `user`; log in as each with the matching role.
2. **Admin** → Units / Hospitals: verify the pending unit and hospital.
3. **Unit** (verified) → Dashboard → *Go on duty & share location* (allow GPS). **Hospital** → Overview: place location, *Start accepting*; Beds: enter capacity.
4. **User** → Report Incident: use GPS or click the map, confirm the marker, send. You get a reference ID. *Service Units* shows nearby units (informational only).
5. **Admin** → Incidents & Dispatch: open the request, review candidates (straight-line + road ETA), *Assign*. Optionally propose a hospital.
6. **Unit** → Requests: *Accept*; Active Assignment: *Start travelling → I have arrived → Complete*. **User** → Live Status shows the route, ETA, unit position age and timeline in real time.


## Documentation
`docs/API.md` (endpoints, roles, validation) · `docs/ARCHITECTURE.md` (design decisions, security, limitations).
