# Project Context

## Purpose

This repository contains a local-first fitness tracking web app for daily weight loss tracking.
The app is designed to:

- record daily body weight, calories, hydration, sleep, steps, and notes
- record meal plans and actual meals for breakfast, lunch, and dinner
- record multiple exercise sessions per day
- support custom exercise templates with dynamic fields
- store all data in SQLite for later querying and trend analysis
- export a structured AI handoff block and import the next-day plan back into the app

## User Profile

Current known baseline:

- height: `1.71 m`
- starting weight: `84 kg`
- current default target weight: `64 kg`
- current default goal length: `60 days`
- workout environment: gym

Important:

- the current target pace is intentionally strict, but it is aggressive
- the app should continue to warn when targets imply unsafe weekly loss pace or excessive calorie deficit
- recommendations should be strict but should not hide safety risks

## Product Shape

The UI currently has two main pages:

1. `Daily Entry`
   - profile and goal settings
   - daily body metrics
   - meal planning and actual meals
   - workout sessions
   - exercise template management
   - export / import workflow for AI-assisted next-day planning

2. `Stats`
   - date-range filtering
   - metric trend chart
   - exercise breakdown
   - daily summary table

## Main Files

- `app.py`: Python HTTP server, SQLite schema, API routes, exchange protocol, git sync admin APIs
- `index.html`: single-page UI shell
- `app.js`: frontend state, forms, charts, import/export actions
- `styles.css`: UI styling
- `fitness_tracker.db`: SQLite database created at runtime, not committed

## Daily Workflow

1. User records the current day in the app.
2. User clicks the export action or calls `POST /api/exchange/export`.
3. AI receives the exported `FITNESS_TRACKER_V1` block.
4. AI replies with:
   - a Chinese analysis of the completed day
   - a `FITNESS_TRACKER_V1` `next_day_plan` block
5. User imports the block with the UI or `POST /api/exchange/import`.
6. The imported plan is reviewed and then saved.

## Cloud / Server Expectations

The app is intended to be deployed on a server and exposed on port `8085`.

The server version should support:

- authenticated git sync status queries
- authenticated fast-forward updates from the configured remote
- optional background auto-sync checks
- a read-only share endpoint for external assistants

These capabilities are implemented in `app.py`.

## AI Behavior Expectations

The cloud AI agent should:

- inspect the current repository state before changing anything
- prefer existing exercise template names
- never invent unsupported exchange protocol fields unless backward compatible
- preserve the `FITNESS_TRACKER_V1` contract
- keep user-facing recommendations actionable, strict, and safety-aware
- treat deployment and git sync operations as admin-only actions
