# AI Protocol

## Protocol Name

`FITNESS_TRACKER_V1`

## Purpose

This protocol is used to transfer structured daily fitness records from the app to an AI model and structured next-day plans back from the AI into the app.

## Block Markers

The structured payload may be embedded in a longer message.

Begin marker:

```text
FITNESS_TRACKER_V1_BEGIN
```

End marker:

```text
FITNESS_TRACKER_V1_END
```

Anything outside the markers is human-readable context. The JSON inside the markers is the machine-readable payload.

## Supported Kinds

- `daily_record`
- `next_day_plan`

## Export Flow

The app exports a `daily_record` block via:

- `GET /api/exchange/export?date=YYYY-MM-DD`
- `POST /api/exchange/export`

The returned object contains:

- `text`: full human-readable message plus protocol block
- `payload`: structured JSON object
- `targetDate`: the expected date for the next-day reply

For cloud sharing, the server may also expose:

- `GET /api/share/context?date=YYYY-MM-DD&token=<FITNESS_SHARE_TOKEN>`

This is a read-only endpoint intended for safe external reading of the current record, recent stats, and AI export payload.

## Import Flow

The app imports a block via:

- `POST /api/exchange/import`

Accepted request body:

```json
{
  "text": "full message containing the protocol block",
  "save": false
}
```

or:

```json
{
  "payload": {
    "version": "FITNESS_TRACKER_V1",
    "kind": "next_day_plan",
    "record": {}
  },
  "save": true
}
```

If `save` is `true`, the server writes the imported record directly into SQLite.

## Reply Contract For AI

When the AI receives a `daily_record` payload, it should:

1. provide a concise Chinese analysis of the completed day
2. return a `FITNESS_TRACKER_V1` block with:
   - `version = "FITNESS_TRACKER_V1"`
   - `kind = "next_day_plan"`
   - `record.date = responseContract.targetDate`

## Record Shape

The `record` object can contain:

```json
{
  "date": "2026-03-19",
  "weightKg": null,
  "intakeCalories": 1800,
  "extraBurnCalories": 200,
  "stepCount": 10000,
  "sleepHours": 7.5,
  "hydrationMl": 2800,
  "note": "short note",
  "meals": {
    "breakfast": {"planText": "", "actualText": "", "calories": null},
    "lunch": {"planText": "", "actualText": "", "calories": null},
    "dinner": {"planText": "", "actualText": "", "calories": null}
  },
  "exerciseEntries": [
    {
      "exerciseTypeName": "慢走",
      "durationMinutes": 40,
      "caloriesBurned": 260,
      "intensity": "中",
      "note": "",
      "values": [
        {"label": "坡度", "unit": "%", "valueText": "8"},
        {"label": "速度", "unit": "km/h", "valueText": "5.5"}
      ]
    }
  ]
}
```

## Important Constraints

- use existing exercise template names only
- do not rename meal keys; they must stay `breakfast`, `lunch`, `dinner`
- `planText` is the preferred field for next-day meal planning
- `actualText` may be left empty in next-day plans
- unknown exercise names are skipped on import
- unknown extra fields should be avoided unless clearly backward compatible

## Recommended AI Strategy

- inspect `availableExerciseTypes` before building a reply
- prefer realistic gym plans based on the current record
- be strict about discipline and calorie control
- surface safety concerns when the target pace is too aggressive
- avoid contradictions between narrative analysis and structured plan
