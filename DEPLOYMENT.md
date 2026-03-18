# Deployment Guide

## Target

- server port: `8085`
- process model: one Python app process behind `systemd` or another service manager
- storage: local SQLite database file created in the project directory

## Requirements

- Python `3.10+` recommended
- Git installed and authenticated for pull / fetch
- Linux service manager such as `systemd`

## Recommended Layout

```text
/home/admin/apps/fitness-tracker
/etc/fitness-tracker.env
/etc/systemd/system/fitness-tracker.service
```

An example service file is included in:

```text
fitness-tracker.service.example
```

## Startup Command

```bash
python3 app.py --host 0.0.0.0 --port 8085
```

## Required Environment Variables

- `FITNESS_ADMIN_TOKEN`
- `FITNESS_SHARE_TOKEN`
- `FITNESS_GIT_REMOTE`
- `FITNESS_GIT_BRANCH`
- `FITNESS_ALLOW_SELF_UPDATE`

See `.env.example` for the full template.

## Git Sync Admin APIs

Status:

```text
GET /api/admin/git/status?refresh=1
Authorization: Bearer <FITNESS_ADMIN_TOKEN>
```

Update:

```text
POST /api/admin/git/update
Authorization: Bearer <FITNESS_ADMIN_TOKEN>
Content-Type: application/json
Body: {"restart": false}
```

## Read-Only Sharing API

To let an external assistant read the current day safely without exposing admin actions, use:

```text
GET /api/share/context?date=2026-03-18&token=<FITNESS_SHARE_TOKEN>
```

This endpoint is read-only and returns:

- selected date
- current profile summary
- current daily record
- recent stats window
- exchange export text and payload

If you want an assistant to read your latest data, share this URL rather than exposing write or admin endpoints.

## Update Safety Rules

The server auto-update logic is intentionally conservative:

- it refuses to update if the working tree is dirty
- it fetches the configured remote branch before comparing versions
- it only applies fast-forward updates
- it may optionally restart the current process if enabled

## Recommended Production Behavior

- keep `FITNESS_ALLOW_SELF_UPDATE=true`
- keep `FITNESS_ALLOW_SELF_RESTART=false` unless restart behavior is well understood
- use `systemd` restart policy for reliability
- store `FITNESS_ADMIN_TOKEN` outside the repository
- use SSH deploy keys or a GitHub token on the server for repository access

## Basic Smoke Tests

```bash
python3 app.py --init-only
python3 app.py --git-sync-status --refresh-remote
curl http://127.0.0.1:8085/
curl "http://127.0.0.1:8085/api/bootstrap?date=2026-03-18"
```

Admin API test:

```bash
curl -H "Authorization: Bearer $FITNESS_ADMIN_TOKEN" \
  "http://127.0.0.1:8085/api/admin/git/status?refresh=1"
```

## Operational Notes

- if the app is exposed publicly, consider putting it behind a reverse proxy later
- if auto-sync is enabled, the server still needs valid git credentials
- if a code update changes the database schema, add an explicit migration step in `app.py`
