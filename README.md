# n8n-nodes-sudomock

n8n community node for the SudoMock API. Integrate mockup rendering into your n8n workflows for Print-on-Demand automation.

[SudoMock](https://sudomock.com) | [Documentation](https://sudomock.com/docs) | [API Reference](https://sudomock.com/docs/api)

## Features

### Account Operations

- **Get Account Info**: Retrieve account details, subscription plan, and usage statistics

### Mockup Management

- **Upload PSD**: Upload PSD templates from a URL
- **List Mockups**: List all your uploaded mockup templates with filtering and pagination
- **Get Mockup**: Get detailed information about a specific mockup template
- **Update Mockup**: Update the name of a mockup template
- **Delete Mockup**: Delete a specific mockup template

### 2D Mockups

- **2D: Create Mockup**: Create a reusable 2D mockup from an image
- **2D: Get Mockup**: Check preparation status and get ready print areas
- **2D: List Mockups**: List your 2D mockups
- **2D: Set Print Areas**: Define print areas with four-point quads
- **2D: Render Mockup**: Render artwork into ready print areas for 5 credits
- **2D: Delete Mockup**: Delete a 2D mockup

### Rendering

- **Render Mockup**: Generate mockups with artwork, personalized text, or both. Text overrides support styled segments, fonts, size, color, stroke color, and overflow, shrink, or clip fitting. Optionally run asynchronously with the **Run Asynchronously** toggle, which returns a `job_id` to track with **Get Job**.
- **Render Video**: Turn a mockup (or an existing image URL) into a short product video (always asynchronous). Choose a supported duration, optional audio/motion, an optional one-off webhook, and optionally **Wait for Completion** to return the finished clip.
- **Remove Background**: Isolate the subject of an image onto a transparent background. The cutout remains stored, and the returned signed PNG URL is valid for 7 days. Costs 25 credits, refunded automatically if processing fails. The same cleanup is available inline on both render operations with the per-artwork **Remove Background** toggle.

### Fonts and Order Artwork

- **Fonts**: List available fonts, fetch one by UUID, upload a custom TTF or OTF from a public URL, and delete your custom fonts
- **Artwork: Delete Stored Files**: Delete stored order artwork by URL or mockup UUID

### Async Jobs

- **Get Job**: Get the status and result of an async render, upload, video, or 2D mockup job by its `job_id`. Terminal statuses are `succeeded`, `failed`, and `cancelled` (pending jobs report `queued`). On success it surfaces `result_url` (render/video) or `mockup_uuid` (upload and 2D creation). Optionally **Wait for Completion** to poll until the job finishes.
- **List Jobs**: List your async render, upload, video, and 2D jobs (keyset paginated, with optional `kind` and Mockup UUID filters).

### Webhooks

- **SudoMock Trigger**: Start a workflow from selected SudoMock events with automatic signature verification
- Manage webhook endpoints that receive a signed HTTPS request the moment a job finishes:
- **Webhook: List Endpoints**
- **Webhook: Get Endpoint**
- **Webhook: Create Endpoint** (set an optional description and choose any current event, or leave empty for all)
- **Webhook: Update Endpoint**
- **Webhook: Delete Endpoint**
- **Webhook: Rotate Secret**
- **Webhook: Send Test**
- **Webhook: List Deliveries**
- **Webhook: Replay Delivery**
- **Webhook: Replay Failed Deliveries**
- **Webhook: Events Feed** (recent deliveries across all of your endpoints)

Canonical events: `render.succeeded`, `render.failed`, `upload.succeeded`, `video.succeeded`, `video.failed`, `2d_mockup.ready`, `2d_mockup.rejected`, `2d_mockup.failed`, `2d_render.succeeded`, `2d_render.failed`, `webhook.test`. Deliveries are signed; see https://sudomock.com/docs/api/webhooks for verification details.

## Installation

### Via n8n UI

In n8n, go to **Settings → Community Nodes → Install** and enter:

```
n8n-nodes-sudomock
```

### Manual Installation

```bash
cd ~/.n8n/nodes
npm install n8n-nodes-sudomock
```

Restart n8n after installation.

## Setup

### 1. Get Your API Key

1. Sign up at [SudoMock](https://sudomock.com)
2. Go to Dashboard → API Keys
3. Create a new API key (starts with `sm_`)

### 2. Add Credentials in n8n

1. Create a new SudoMock node
2. Click on **Credentials → Create New**
3. Enter your SudoMock API Key
4. Save and test the connection

## Operations

### Get Account Info

Retrieve your account information, subscription details, and credit usage.

**Output:**

- Account: UUID, email, name, created date
- Subscription: Plan name, status, billing period
- Usage: Credits used/remaining, billing dates
- API Key: Name, creation date, last used, total requests

**Example Output:**

```json
{
  "success": true,
  "data": {
    "account": {
      "uuid": "user-123",
      "email": "user@example.com",
      "name": "John Doe"
    },
    "subscription": {
      "plan": { "name": "Pro", "tier": "pro" },
      "status": "active"
    },
    "usage": {
      "credits_used_this_month": 250,
      "credits_limit": 1000,
      "credits_remaining": 750
    }
  }
}
```

---

### Upload PSD

Upload a PSD template from a public URL.

**Parameters:**

- **PSD File URL** (required): Public URL to your PSD file (up to Adobe's official PSD file size limit)
- **Template Name** (optional): Custom name for the template (auto-generated if not provided)

**Example:**

```
PSD URL: https://storage.example.com/mockup.psd
Name: T-Shirt Mockup Front
```

**Output:**

- Mockup UUID (use for rendering)
- Smart object UUIDs and details
- Thumbnail URLs

---

### List Mockups

List all your uploaded mockup templates with optional filtering and pagination.

**Parameters:**

- **Return All**: Fetch all mockups or limit results
- **Limit**: Number of results (1-100, default: 20)
- **Additional Options**:
  - Filter by Name: Exact name match
  - Created After: Date filter
  - Created Before: Date filter
  - Sort By: `created_at`, `updated_at`, `name`
  - Sort Order: `asc` or `desc`

**Example:**

```
Limit: 20
Sort By: Created At
Sort Order: Descending
```

**Output:**
Each mockup as a separate item with full details (UUID, name, smart objects, thumbnails, etc.)

---

### Get Mockup

Retrieve detailed information about a specific mockup template.

**Parameters:**

- **Mockup UUID** (required): UUID of the mockup to retrieve

**Example:**

```
Mockup UUID: c315f78f-d2c7-4541-b240-a9372842de94
```

**Output:**
Complete mockup details including all smart objects, thumbnails, and metadata.

---

### Update Mockup

Update the name of a mockup template.

**Parameters:**

- **Mockup UUID** (required): UUID of the mockup to update
- **New Name** (required): New name for the template

**Example:**

```
Mockup UUID: c315f78f-d2c7-4541-b240-a9372842de94
New Name: Updated T-Shirt Mockup
```

**Output:**
Updated mockup details with the new name.

---

### Render Mockup

Generate a mockup by filling smart objects with your designs.

**Parameters:**

- **Mockup UUID** (required): UUID from Upload PSD response
- **Smart Objects** (required): One or more smart objects to fill
  - Smart Object UUID
  - Design URL (PNG, JPG, WebP)
  - Fit Mode: `fill`, `contain`, or `cover` (recommended)
  - **Additional Options** (optional):
    - Rotation: -360 to 360 degrees
    - Remove Background: clean the artwork before placing it (adds 25 credits per artwork)
    - Color Overlay: Hex color code
    - Color Blend Mode: Various blend modes
    - Brightness: -150 to 150
    - Contrast: -100 to 100
    - Opacity: 0-100

- **Export Options** (optional):
  - Image Format: WebP (recommended), PNG, or JPEG
  - Image Size: Width in pixels (100-10000, default 2048)
  - Quality: 1-100 for JPG/WebP
  - Export Label: Custom label for file naming

**Example:**

```
Mockup UUID: abc123-def456
Smart Object 1:
  - UUID: so-uuid-001
  - Design URL: https://cdn.example.com/design.png
  - Fit Mode: Cover
  - Brightness: 10
  - Contrast: 5

Export Options:
  - Format: WebP
  - Size: 1920
  - Quality: 95
```

**Output:**

```json
{
  "success": true,
  "renderedImageUrl": "https://cdn.sudomock.com/renders/abc123.webp",
  "allRenderedUrls": [
    "https://cdn.sudomock.com/renders/abc123.webp"
  ],
  "data": {
    "print_files": [...]
  }
}
```

---

### Remove Background

Isolate the subject of an image onto a transparent background. The cutout remains stored, and the returned signed PNG URL is valid for 7 days.

**Parameters:**

- **Image URL** (required): public URL of the image to process

**Example:**

```
Image URL: https://cdn.example.com/product-photo.jpg
```

**Output:**

```json
{
  "success": true,
  "data": {
    "url": "https://cdn.sudomock.com/bg-cutouts/abc123.png",
    "width": 2000,
    "height": 2000,
    "credits_charged": 25
  }
}
```

The returned signed URL is valid for 7 days and can be fed straight into **Render Mockup** or **2D: Render Mockup** as artwork during that window. The cutout remains stored. Processing costs 25 credits per image and is refunded automatically if it fails. To clean artwork as part of a render instead, use the per-artwork **Remove Background** toggle on either render operation.

---

### Delete Mockup

Delete a specific mockup template.

**Parameters:**

- **Mockup UUID** (required): UUID of the mockup to delete

**Example:**

```
Mockup UUID: c315f78f-d2c7-4541-b240-a9372842de94
```

**Output:**
Deletion confirmation

---

### 2D Mockup Operations

Create, prepare, render, and manage reusable mockups from product images without a PSD.

1. **2D: Create Mockup** accepts a public `source_url` or `source_base64`, plus an optional name. Creation is asynchronous and returns the 202 response with `mockup_uuid`, `status_url`, and job details unchanged. Use the job ID with **Get Job** when needed.
2. **2D: Get Mockup** returns `draft`, `ready`, or `failed` status. Poll this operation until the mockup is `ready`; the ready response includes each print area's UUID and points.
3. **2D: List Mockups** returns your 2D mockups.
4. **2D: Set Print Areas** accepts one or more print areas. Each print area is a quad with four `[x, y]` coordinate pairs.
5. **2D: Render Mockup** accepts the mockup UUID and one or more ready print area UUIDs. Each print area includes either an artwork URL or Base64 artwork, with optional background removal (adds 25 credits per artwork), color, adjustments, and placement. Export options support PNG or JPG at 1024, 2048, or 4096 pixels, plus quality and DPI. Each render costs 5 credits and returns `print_files`, where `print_files[0]` is the CDN URL.
6. **2D: Delete Mockup** deletes the selected 2D mockup.

Create must reach `ready` through **2D: Get Mockup** before **2D: Render Mockup**.

---

### Render Video

Turn a mockup (or an existing image URL) into a short product video. Always asynchronous: returns a `job_id` you can track with **Get Job**.

**Parameters:**

- **Input Mode**: `Render Mockup` (render a mockup with your designs first) or `Animate Image URL` (animate a public image directly)
- **Mockup UUID** (required in Render Mockup mode): UUID of the mockup to animate
- **Smart Objects** (required in Render Mockup mode): one or more smart objects with a Design URL and Fit Mode
- **Image URL** (required in Animate Image URL mode): public HTTPS image (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.avif`)
- **Webhook URL** (optional): one-off HTTPS URL notified when this job finishes
- **Video Options**:
  - **Duration (Seconds)**: clip length (default 4; must be an allowed duration for the chosen model — the default model `veo-3.1-fast` allows 4, 6, or 8; max 15)
  - **Audio**: include a generated audio track (default false; may cost extra credits depending on model)
  - **Motion**: `ambient` (default) or `showcase`
  - **Advanced Model**: optional override pinning a roster model (`veo-3.1-fast`, `kling-v3-pro`, `kling-2.6-pro`, `seedance-2.0`, `wan-2.5`); leave empty to auto-pick by plan tier
- **Wait for Completion**: poll the job and return the finished clip instead of the queued job
- **Poll Timeout (Seconds)**: max wait when Wait for Completion is on

**Output:**
The 202 acknowledgement (`job_id`, `kind`, `status`, `status_url`, `estimated_credits`, ...), or the finished job (with `result_url` / `resultUrl`) when Wait for Completion is on.

---

### Get Job

Track an asynchronous render, upload, video, or 2D mockup job by its `job_id`.

**Parameters:**

- **Job ID** (required): the `job_id` from an async render, upload, video, or 2D mockup request
- **Wait for Completion**: poll until a terminal status (`succeeded`, `failed`, `cancelled`)
- **Poll Timeout (Seconds)**: max wait when Wait for Completion is on

**Output:**
The job object. On success it surfaces `result_url` / `resultUrl` (render/video) or `mockup_uuid` / `resultMockupUuid` (upload), plus `credits_charged` and `payg` when applicable.

---

### List Jobs

List your async render, upload, and video jobs (newest first, keyset paginated).

**Parameters (all optional, under Filters):**

- **Kind**: `render`, `upload`, or `video`
- **Mockup UUID**: only jobs derived from this source mockup
- **Limit**: 1-50 (default 20)
- **Cursor**: opaque `next_cursor` from a previous response for pagination

**Output:**
`{ jobs: [...], next_cursor }`.

> **Note:** Bulk "delete all mockups" is intentionally not exposed — the BE gates `DELETE /mockups/all` to dashboard (Bearer/JWT) auth only, so it is not callable with an API key. Delete mockups individually with **Delete Mockup**, or use the SudoMock dashboard.

---

### Webhook Operations

Manage webhook endpoints and their deliveries. See the [Webhooks](#webhooks) feature list above for the full operation set and the canonical event types.

**Common parameters:**

- **Webhook Endpoint ID** (required for get/update/delete/rotate/test/deliveries/replay/replay-failed)
- **Endpoint URL** + **Description** (create) and **Events** (create/update): leave Events empty to subscribe to all
- **Delivery ID** (replay)
- **Webhook: Events Feed** takes no parameters (returns recent deliveries across all your endpoints)

---

## Example Workflows

Ready-to-use n8n workflows are available in the [`examples/`](./examples) folder:

### 1. Complete API Test Workflow

**File**: [`examples/complete-test-workflow.json`](./examples/complete-test-workflow.json)

Tests the core mockup operations in sequence:

- Get Account Info → Upload PSD → Get Mockup → List Mockups
- Render Mockup → Update Name → Verify Update → Delete Mockup

Perfect for verifying your setup and understanding the complete workflow.

[View Details →](./examples/README.md#1-complete-api-test-complete-test-workflowjson)

### 2. Rate Limit Handling Workflow

**File**: [`examples/rate-limit-test-workflow.json`](./examples/rate-limit-test-workflow.json)

Demonstrates proper rate limit error handling with automatic retry logic:

- Detects 429 errors
- Extracts retry-after value
- Waits and automatically retries
- Shows detailed error information

[View Details →](./examples/README.md#2-rate-limit-error-handling-test-rate-limit-test-workflowjson)

### 3. Sequential Batch Render Workflow

**File**: [`examples/batch-render-workflow.json`](./examples/batch-render-workflow.json)

Demonstrates the power of n8n workflows with sequential batch processing:

- Renders 10 mockups one after another
- Uses different designs for each render
- 2-second delay between renders to avoid rate limits
- Progress tracking and final summary with all rendered URLs

Perfect for understanding batch processing and workflow automation.

[View Details →](./examples/README.md#3-sequential-batch-render-batch-render-workflowjson)

### Quick Start with Examples

1. Import a workflow:

   ```
   n8n UI → Workflows → Import from File → Select workflow JSON
   ```

2. Configure credentials:

   ```
   Click any SudoMock node → Credentials → Select your API key
   ```

3. Execute:
   ```
   Click "Execute Workflow" button
   ```

See [`examples/README.md`](./examples/README.md) for detailed instructions, customization options, and troubleshooting.

---

## Usage Examples

### Example 1: Complete Mockup Workflow

```
1. [HTTP Request]
   → Download PSD from URL

2. [SudoMock: Upload PSD]
   → Upload template
   → Extract: mockupUuid, smartObjectUuid

3. [SudoMock: Render Mockup]
   → Use extracted UUIDs
   → Add design URL
   → Get: renderedImageUrl

4. [Etsy/Shopify Node]
   → Create product listing
   → Use rendered mockup image
```

### Example 2: Batch Process Designs

```
1. [Airtable Trigger]
   → Get list of designs to process

2. [SudoMock: List Mockups]
   → Get available templates

3. [Loop Over Designs]
   → [SudoMock: Render Mockup]
   → Generate mockup for each design

4. [Store Results]
   → Save rendered URLs to database
```

### Example 3: Account Monitoring

```
1. [Schedule Trigger]
   → Run daily at 9 AM

2. [SudoMock: Get Account Info]
   → Check credit usage

3. [IF Node]
   → If credits < 100

4. [Send Email/Slack]
   → Alert about low credits
```

## Rate Limits

### Request Rate Limits

All authenticated users have a base rate limit of **1000 requests per minute** with burst capacity of 1500 requests.

Unauthenticated requests (IP-based): **30 requests per minute**

### Concurrent Request Limits (Plan-Based)

| Plan    | Concurrent Renders | Concurrent Uploads |
| ------- | ------------------ | ------------------ |
| Free    | 1                  | 1                  |
| Starter | 3                  | 2                  |
| Pro     | 10                 | 5                  |
| Scale   | 25                 | 10                 |

### Rate Limit Error Handling

The node automatically detects and handles two types of rate limit errors:

#### 1. Request Rate Limit Exceeded (1000 RPM)

**Error Output:**

```json
{
  "error": "Rate limit exceeded (1000 requests/minute). Please retry after 42 seconds.",
  "operation": "render",
  "statusCode": 429,
  "retryAfter": 42,
  "errorType": "rate_limit_exceeded",
  "errorDetails": {
    "type": "rate_limit_exceeded",
    "limit": 1000,
    "remaining": 0
  }
}
```

#### 2. Concurrent Limit Exceeded (Plan-Based)

**Error Output:**

```json
{
  "error": "Concurrent render limit reached (11/10). Please wait 5 seconds and try again.",
  "operation": "render",
  "statusCode": 429,
  "retryAfter": 5,
  "errorType": "concurrent_limit_exceeded",
  "errorDetails": {
    "type": "concurrent_limit_exceeded",
    "resource": "concurrent-render",
    "limit": 10,
    "current": 11
  }
}
```

### Best Practices

1. **Enable "Continue On Fail"** in n8n node settings to capture rate limit errors without stopping the workflow
2. **Implement retry logic** using the `retryAfter` value from error output
3. **Monitor `errorType`** to distinguish between request rate limits and concurrent limits
4. **Use n8n's "Wait" node** with `{{$json.retryAfter}}` seconds before retrying

### Example: Retry Logic Workflow

```
[SudoMock Render] (Continue On Fail: ON)
    → [IF: Check statusCode]
        → If 429: [Wait: {{$json.retryAfter}} seconds]
            → [SudoMock Render Again]
        → Else: Continue
```

## Error Handling

All operations support the **Continue On Fail** option in n8n. When enabled:

- Errors are captured as output items
- Workflow continues to next item
- Error details included in output

**Example Error Output:**

```json
{
  "error": "Rate limit exceeded. Retry after 42 seconds.",
  "operation": "render"
}
```

## Development

### Setup

```bash
# Clone repository
git clone https://github.com/sudomock/n8n-nodes-sudomock.git
cd n8n-nodes-sudomock

# Install dependencies
pnpm install

# Build
pnpm build

# Development (watch mode)
pnpm dev
```

### Testing Locally

```bash
# Link package globally
npm link

# Link in n8n's custom nodes
cd ~/.n8n/custom
npm link n8n-nodes-sudomock

# Start n8n
n8n start
```

Access n8n at `http://localhost:5678` and search for "SudoMock" in the nodes panel.

### Build Commands

```bash
# Build TypeScript and icons
pnpm build

# Format code
pnpm format

# Lint code
pnpm lint

# Fix linting issues
pnpm lintfix
```

## Resources

- [SudoMock Website](https://sudomock.com)
- [API Documentation](https://sudomock.com/docs/api)
- [n8n Documentation](https://docs.n8n.io)
- [Report Issues](https://github.com/sudomock/n8n-nodes-sudomock/issues)

## License

MIT

## Support

- Email: hello@sudomock.com
- Documentation: https://sudomock.com/docs
- Community: https://community.n8n.io

---

**Made with ❤️ for the n8n community**
