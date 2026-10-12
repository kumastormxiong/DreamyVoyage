# Dreamy Voyage Blind Test Game - Cloudflare D1 Engine

Live Edge Backend for real-time global community score median calculation & aggregation.

## Live Deployment Info

- **Worker Endpoint:** `https://dreamy-blind-test-api.kuma-storm-xiong-5dc.workers.dev`
- **D1 Database:** `dreamy-blind-test-db` (`728550e2-3f2f-4c4d-82cb-fd0ef218a8df`)
- **Region:** APAC (Singapore)

---

## API Endpoints

### 1. `GET /api/stats`
Fetches community scores, participant counts, and calculated medians.
- Query Parameter (Optional): `?trackId=69`
- Example Response:
```json
{
  "status": "ok",
  "updatedAt": "2026-10-12T17:19:29.703Z",
  "stats": {
    "69": { "count": 9, "median": 86 },
    "70": { "count": 8, "median": 84 }
  }
}
```

### 2. `POST /api/score`
Submits a user rating, stores in D1 SQLite, and returns updated median.
- Request Body:
```json
{
  "trackId": 69,
  "score": 88,
  "stage1": 85,
  "stage2": 90,
  "stage3": 89
}
```
- Response:
```json
{
  "status": "ok",
  "trackId": 69,
  "score": 88,
  "count": 9,
  "median": 86,
  "timestamp": "2026-10-12T17:19:40.000Z"
}
```

---

## Maintenance & Commands

```bash
# Test locally
npx wrangler dev

# Re-run schema or migrations
npx wrangler d1 execute dreamy-blind-test-db --remote --file=schema.sql

# Query database records
npx wrangler d1 execute dreamy-blind-test-db --remote --command="SELECT COUNT(*) FROM track_scores"

# Deploy update
npx wrangler deploy
```
