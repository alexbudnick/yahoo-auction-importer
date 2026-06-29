# Yahoo Auction Tracker for Airtable + Railway

This Railway cron app reads your Airtable auction watchlist, opens each Yahoo Auctions URL, parses public auction information, and writes back fields like current bid, end time, status, final price, and last checked.

## Airtable fields to create

In your `Table 1`, add these fields with these exact names unless you change the matching environment variables:

| Field name | Field type |
|---|---|
| `Auction Link` | URL |
| `Current Bid JPY` | Number or Currency |
| `Buyout Price JPY` | Number or Currency |
| `Bid Count` | Number |
| `End Time` | Date with time |
| `Auction Status` | Single select: `Active`, `Ended`, `Error`, `Cancelled` |
| `Final Price JPY` | Number or Currency |
| `Last Checked` | Date with time |
| `Error Notes` | Long text |
| `My Max Bid JPY` | Number or Currency, optional |
| `Bid Result` | Single select, optional |
| `Yahoo Photos` | Attachment |
| `Yahoo Description` | Long text |
| `Yahoo Condition` | Single line text or single select |
| `Yahoo Condition Rank` | Number, optional |

The app can optionally update your title field too. The default is `Title (Auction Link)` because that is visible in your screenshot.

## Important limitation

Public Yahoo Auctions pages can show public facts like price, end time, bid count, and ended/active status. They cannot reliably prove whether **your** account won. For true won/lost status, connect your proxy/Yahoo won-auction emails later, or manually update the result field.

## Railway setup

1. Create a new Railway project.
2. Add this folder from GitHub or upload it as a new service.
3. Set the Railway start command to:

```bash
npm start
```

4. Add these Railway variables:

```bash
AIRTABLE_TOKEN=your_airtable_personal_access_token
AIRTABLE_BASE_ID=your_base_id
AIRTABLE_TABLE_NAME=Table 1
AIRTABLE_VIEW_NAME=Grid view
DRY_RUN=true
MAX_RECORDS=100
REQUEST_DELAY_MS=900
```

5. Add the field-name variables from `.env.example` if your fields are named differently.
6. Deploy once with `DRY_RUN=true` and check the logs.
7. Change `DRY_RUN=false` and redeploy.
8. In Railway, set this service as a cron job. A good schedule is every 30 minutes:

```cron
*/30 * * * *
```

For last-hour tracking, every 15 minutes is usually enough:

```cron
*/15 * * * *
```

## Airtable token permissions

Your personal access token needs access to the base and permission to read/write records.

## Notes

Yahoo Auctions page structure can change. If the app logs `Could not parse current bid`, send me the Railway log line and one auction URL, and I can update the parser.


## v1.1 update behavior

This version is more forgiving when Airtable rejects a destination field. If Airtable says a field cannot accept the provided value, the app logs the rejected field name, skips that field for the current run, and still updates the remaining valid fields.

You can also disable an optional destination field by setting its Railway variable to `skip`, for example:

```bash
FIELD_END_TIME=skip
FIELD_TITLE=skip
```

Use this only as a temporary workaround. The best fix is to make the Airtable field type match the value the app writes.


## v1.2 Yahoo listing enrichment

This version can also pull public listing enrichment fields from Yahoo Auctions:

| Field name | Airtable field type | Notes |
|---|---|---|
| `Yahoo Photos` | Attachment | The app writes the public Yahoo image URLs into the attachment field. By default it only fills this when the field is empty. |
| `Yahoo Description` | Long text | Seller listing description when the page exposes it in the HTML. |
| `Yahoo Condition` | Single line text or single select | Yahoo's public condition label, usually Japanese text such as `やや傷や汚れあり`. |
| `Yahoo Condition Rank` | Number | Optional 1-6 numeric rank. 1 is best/new, 6 is worst/poor. |

Recommended Railway variables:

```bash
FIELD_PHOTOS=Yahoo Photos
FIELD_DESCRIPTION=Yahoo Description
FIELD_CONDITION=Yahoo Condition
FIELD_CONDITION_RANK=Yahoo Condition Rank
UPDATE_PHOTOS_ONLY_IF_EMPTY=true
ENRICH_ENDED_RECORDS_IF_MISSING=true
MAX_PHOTOS_PER_AUCTION=12
MAX_DESCRIPTION_CHARS=12000
UPDATE_STATIC_FIELDS_ONLY_IF_EMPTY=true
```

`ENRICH_ENDED_RECORDS_IF_MISSING=true` matters because once old records are marked `Ended`, earlier versions skipped them. This version will still revisit ended rows when photos/description/condition fields are empty.

If you use `Yahoo Condition` as a single-select field, create these possible values first or leave `typecast=true` enabled as this app does:

```text
未使用
未使用に近い
目立った傷や汚れなし
やや傷や汚れあり
傷や汚れあり
全体的に状態が悪い
```

Photo notes: Airtable attachment fields store a copy/reference from the supplied image URL. This is intended for auction tracking/reference. Do not reuse seller photos in your own listings unless you have permission or rights to do so.
