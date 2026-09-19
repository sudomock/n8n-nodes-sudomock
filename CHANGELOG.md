# Changelog

All notable changes to `n8n-nodes-sudomock` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.12.0] - 2026-09-19

### Changed

- The node calls the two mockup families on their own paths:
  `/api/v1/photo-mockups` for Photo Mockup: Create / Get / List / Set Print
  Areas / Render / Delete, and `/api/v1/psd-mockups` for PSD Mockup: List /
  Get / Update / Delete. The earlier paths (`/api/v1/sudoai/2d-mockups` and
  `/api/v1/mockups`) are still served by the API, so nothing built against
  them stops working; this package simply no longer sends them.
- **Get Job kind.** A photo mockup created or rendered asynchronously through
  this version reports `kind: photo_mockup_create` / `photo_mockup_render`,
  where earlier versions reported `2d_create` / `2d_render`. A workflow that
  compares `$json.kind` against the old spellings after Get Job should compare
  against the new ones. List Jobs already accepts both spellings and returns
  the same jobs for either.
- The operation dropdown names the families. The six `2D: ...` entries read
  `Photo Mockup: Create / Delete / Get / List / Render / Set Print Areas`, and
  Upload PSD, List Mockups, Get Mockup, Update Mockup, Delete Mockup and
  Render Mockup read `PSD Mockup: Upload / List / Get / Update / Delete /
  Render`. Operation values and parameter names are unchanged, so a saved
  workflow opens on the same operation with the same fields and keeps running
  without edits. Photo Mockup: Delete now answers with
  `message: "Photo mockup deleted successfully"`.

## [0.11.0] - 2026-09-18

### Added

- The five Photo Mockups event names (`photo_mockup.ready`,
  `photo_mockup.rejected`, `photo_mockup.failed`,
  `photo_mockup_render.succeeded`, `photo_mockup_render.failed`) can be
  selected in the SudoMock Trigger, in Webhook: Create/Update Endpoint and in
  the delivery/event feed filters, next to the legacy `2d_mockup.*` and
  `2d_render.*` names.
- **Event Naming** on Webhook: Create Endpoint (`current`, the default, or
  `legacy`). It pins which spelling of the five Photo Mockups events the
  endpoint receives, and the payload `kind` follows the pin. The node now
  sends the pin explicitly on every create; a workflow saved before this
  option existed sends `current`, which is what the API already gave it.
- **Event Naming** under Update Fields on Webhook: Update Endpoint, to re-pin
  an existing endpoint to `current` or `legacy` once its receiver is ready
  for the other spelling. An update that leaves the field out does not touch
  the pin.
- **List Jobs** accepts the Photo Mockups job kinds `photo_mockup_create` and
  `photo_mockup_render` in its Kind filter, next to `2d_create` and
  `2d_render`. A Photo Mockup kind and its 2D spelling name the same jobs:
  filtering by either returns both.

### Changed

- The SudoMock Trigger registers its webhook endpoint with
  `event_naming: current`, so the deliveries it receives carry the Photo
  Mockups names: `type` is `photo_mockup.ready` instead of `2d_mockup.ready`,
  `photo_mockup_render.succeeded` instead of `2d_render.succeeded`, and the
  payload `kind` is `photo_mockup_create` / `photo_mockup_render` instead of
  `2d_create` / `2d_render`. This applies when the trigger creates a new
  endpoint (a new trigger node, or one whose endpoint was deleted and
  re-created on activation). An endpoint created by an earlier version keeps
  its legacy pin and keeps delivering the old names until it is re-created.
  Workflows that compare `$json.type` or `$json.kind` against the old
  spellings should compare against the new ones once the trigger's endpoint
  has been re-created.

## [0.10.1] - 2026-08-20

### Fixed

- Removed `usableAsTool` from the SudoMock Trigger node description. Trigger
  nodes cannot be invoked as AI tools, and the flag polluted the tool picker
  (n8n verification review feedback on 0.10.0). The regular SudoMock node keeps
  the flag; only the trigger lost it.

## [0.10.0] - 2026-08-19

### Changed (BREAKING)
- The three fit modes are now spelled the same way everywhere: `fill`, `fit`
  and `crop`, with the node's own labels reading Fill, Fit and Crop. Before
  this the label and the value could disagree: a Fill button in the editor
  sends `cover`, which keeps proportions and crops, while this node's Fill
  sent `fill`, which does not keep them. No error was returned and no warning
  shown, only a squashed design, and in print on demand that can reach a
  physical print.
- `contain` and `cover` are the older names for `fit` and `crop`. The API
  still accepts them and will keep accepting them, so a workflow saved before
  this release keeps rendering exactly as it did. Only the words this node
  writes have changed.


## [0.9.0] - 2026-08-19

### Changed (BREAKING)
- The fit mode whose value is `fill` is now labelled **Stretch**, not Fill. The
  same word meant the opposite thing in two places: in the Studio and the
  dashboard editor a Fill button sends `cover`, which keeps proportions and
  crops the overflow, while here it sent `fill`, which does not keep them. No
  error was returned and no warning shown, only a squashed design, and in print
  on demand that can reach a physical print. The values are unchanged, only the
  label. `cover` is also no longer described with the verb "fill", which had
  been joining the two ideas this rename exists to separate.
- Placement is split by target kind. A surface target takes Coverage, or an
  explicit Width and Height pair. A print area target takes Fit, or an explicit
  Width and Height pair. Sending a percentage to a print area, or a fit to a
  surface, is answered by the API with a 422, so the two sets of dials now
  appear only under the target they belong to.
- Coverage and Fit no longer carry a client-side default onto the wire. Every
  render this node produced used to travel with `coverage: 70` and
  `fit: "contain"` whether or not anyone had asked for them, which silently
  sized artwork nobody had sized. What is not filled in is not sent, and the
  endpoint's own default applies.
- A render with no placement now covers the whole print area rather than 70
  percent of it. This is the intended growth, not a regression.
- The Target Type value `fullSurface` is renamed to `surface`. Workflows saved
  before this release still hold the old value and keep working: it is accepted
  on read and never written again. Dropping it would not have failed loudly, it
  would have sent those workflows down the print-area branch and rendered the
  wrong target while reporting success.
- A percentage left behind on a print area by an older workflow is dropped
  rather than forwarded. Its author has no control left to remove it through,
  so forwarding it would earn a 422 they could not trace to a field they can no
  longer see.
- `surfaces[]` in a mockup response holds one entry per printable product, not
  only the ones covering a whole object. A product can carry both a surface and
  saved print areas, and they are separate render targets.

### Removed (BREAKING)
- `surfaces[].coverage` is gone from the API. It was always the fixed string
  `"full"`, so it stated nothing a caller could act on while reading exactly
  like a dial they could turn.


### Fixed
- The account-monitoring recipe told integrators to alert on `credits_remaining`
  alone. An account paying as it goes has no monthly allowance, so it reports
  `credits_limit: 0` and `credits_remaining: 0` permanently and those numbers
  never reset. A funded account therefore raised that alert forever. The recipe
  now branches on how the account is actually funded and watches
  `prepaid_balance` when there is no allowance.

### Changed
- The documented **Get Account Info** response now matches what the API returns:
  `subscription.plan` is a slug string with `tier` beside it, not a nested
  object, and `usage` includes `prepaid_balance` and `prepaid_balance_currency`.
  A second example shows the funded account whose credit fields are all zero.

The node itself returns the account response unchanged, so the new fields were
already reaching workflows; only the documentation had to catch up.
