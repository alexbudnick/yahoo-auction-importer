# Auction companion

Installation is pending Google authorization. Do not treat the initial Sheet as a live feed.

1. Open the companion Sheet, then Extensions → Apps Script.
2. Paste Code.gs from this directory into the bound project.
3. In Project Settings → Script Properties, set AIRTABLE_TOKEN to a personal access token restricted to the Auction Workflow base with data.records:read and data.records:write. Never put it in spreadsheet cells or chat.
4. Save and run install once as Alex. Approve Google access to the spreadsheet, external requests, and triggers. First installation refreshes the snapshot, so preserve pending edits first.
5. Test a max-bid edit in each direction and a Confirmed Won change before sharing with Matt.

Expected behavior: installable edit trigger plus approximately one-minute polling; not guaranteed instantaneous. Yahoo facts remain on the existing 5-minute scraper schedule. Active, Won, and Lost - Ended are projections of one record per auction. Unknown results remain ended until a win is confirmed. No bids are placed by this integration. No Inventory base access is required.

Editable in both places: maximum bid, confirmed-win checkbox, bid instructions, Matt status, Matt notes. Source facts remain controlled by the Yahoo importer. Add new Yahoo links on Active. Do not change existing links/IDs or manually move/delete rows.

Conflict handling stops refresh and writes a visible Setup error rather than silently overwriting an edit. Preserve pending edits before rerunning install, which reloads Airtable. Token is visible to bound-script editors; limit spreadsheet editor access accordingly.
