# n8n-nodes-sudomock Example Workflows

This folder contains example n8n workflows to help you get started with the SudoMock node and test all its features.

## Available Workflows

### 1. Complete API Test (`complete-test-workflow.json`)

A comprehensive workflow that tests **all 7 operations** of the SudoMock node in sequence.

**What it tests:**
1. ✅ **Get Account Info** - Verifies API credentials and retrieves account details
2. ✅ **Upload PSD** - Uploads a test PSD template from URL
3. ✅ **Get Mockup Details** - Retrieves the uploaded mockup information
4. ✅ **List All Mockups** - Lists mockups with sorting and pagination
5. ✅ **Render Mockup** - Generates a mockup with a test design (Unsplash image)
6. ✅ **Update Mockup Name** - Updates the mockup's name
7. ✅ **Verify Update** - Confirms the name was updated
8. ✅ **Delete Test Mockup** - Cleans up by deleting the test mockup

**Test Summary Output:**
The workflow ends with a summary showing:
- Account email
- Uploaded mockup UUID
- Mockup name before/after update
- Total mockups found
- Rendered image URL
- Deleted mockup UUID

**How to use:**
1. Import `complete-test-workflow.json` into n8n
2. Configure your SudoMock API credentials
3. Click "Execute Workflow"
4. Review the "Test Summary" node output for results

**Test PSD File:**
The workflow uses a real PSD file hosted at:
```
https://drive.usercontent.google.com/download?id=1CVh67lYHkyCHRw6NGJYYWLRar65E6b9K&export=download
```

**Test Design Image:**
The render operation uses an Unsplash image:
```
https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1000&q=80
```

---

### 2. Rate Limit Error Handling Test (`rate-limit-test-workflow.json`)

A workflow demonstrating proper handling of SudoMock API rate limits with automatic retry logic.

**What it demonstrates:**
- ✅ Detecting 429 rate limit errors
- ✅ Extracting `retryAfter` value from error response
- ✅ Identifying error type (`rate_limit_exceeded` vs `concurrent_limit_exceeded`)
- ✅ Automatic retry after waiting the specified time
- ✅ Displaying detailed rate limit error information

**Features:**
- **Continue On Fail** enabled to capture errors without stopping
- Conditional logic to detect status code 429
- Wait node that uses `retryAfter` from error response
- Automatic retry after rate limit period
- Detailed error information display

**How to use:**
1. Import `rate-limit-test-workflow.json` into n8n
2. Configure your SudoMock API credentials
3. Click "Execute Workflow"
4. If rate limited, you'll see:
   - Error type (rate_limit_exceeded or concurrent_limit_exceeded)
   - Retry-after seconds
   - Full error details
   - Automatic retry and success

**Testing Rate Limits:**
To trigger a rate limit error for testing:
- Make many rapid requests (>1000 per minute for request limit)
- Make concurrent renders beyond your plan limit (see README.md for limits)

---

### 3. Sequential Batch Render (`batch-render-workflow.json`)

A powerful workflow demonstrating **sequential batch processing** - rendering 10 mockups one after another using different designs.

**What it demonstrates:**
- ✅ **Batch Processing** - Processing multiple items sequentially
- ✅ **Loop Control** - Each render completes before the next starts
- ✅ **Rate Limit Prevention** - 2-second delay between renders
- ✅ **Error Handling** - Captures failed renders without stopping
- ✅ **Progress Tracking** - Logs each render as it completes
- ✅ **Final Summary** - Aggregates all results at the end

**Workflow Steps:**
1. Upload PSD template (once)
2. Get mockup details and smart object UUIDs
3. Prepare array of 10 different design URLs (Unsplash images)
4. Split into batches (batch size = 1 for sequential processing)
5. Render each mockup one at a time
6. Wait 2 seconds between renders
7. Log progress for each render
8. Generate final summary with all rendered URLs
9. Clean up by deleting the test mockup

**How to use:**
1. Import `batch-render-workflow.json` into n8n
2. Configure your SudoMock API credentials
3. Click "Execute Workflow"
4. Watch as 10 renders execute sequentially
5. Review the "Final Summary" node for all rendered URLs

**Key Features:**
- **Sequential Execution**: Uses Split In Batches with batch size = 1
- **10 Different Designs**: Uses variety of Unsplash images
- **Wait Between Renders**: 2-second delay to avoid rate limits
- **Error Recovery**: Continue on fail + error handler for failed renders
- **Progress Visibility**: Each render logs its status (e.g., "Render 3/10 completed")

**Expected Output:**
```json
{
  "totalRenders": 10,
  "successfulRenders": 10,
  "failedRenders": 0,
  "renderedUrls": [
    "https://cdn.sudomock.com/renders/batch-render-1.webp",
    "https://cdn.sudomock.com/renders/batch-render-2.webp",
    "... 8 more URLs ...",
    "https://cdn.sudomock.com/renders/batch-render-10.webp"
  ],
  "mockupUuid": "abc123-def456",
  "completedAt": "2026-01-05T12:30:45.123Z"
}
```

**Design URLs Used:**
The workflow uses 10 different abstract/artistic images from Unsplash to showcase variety in rendering.

---

## How to Import Workflows

### Method 1: Via n8n UI
1. Open n8n (http://localhost:5678)
2. Click on **Workflows** in the left sidebar
3. Click **Import from File** or **Import from URL**
4. Select the workflow JSON file
5. Click **Import**

### Method 2: Copy-Paste
1. Open the workflow JSON file
2. Copy all contents (Cmd/Ctrl + A, then Cmd/Ctrl + C)
3. In n8n, go to a blank workflow
4. Press Cmd/Ctrl + V to paste
5. The workflow will be imported

---

## Prerequisites

Before running these workflows, ensure:

1. **SudoMock Node Installed**
   ```bash
   cd ~/.n8n/nodes
   npm install n8n-nodes-sudomock
   ```

2. **API Credentials Configured**
   - Get your API key from [SudoMock Dashboard](https://sudomock.com/dashboard/api-keys)
   - In n8n: Settings → Credentials → Create New → SudoMock API
   - Enter your API key and save

3. **Active SudoMock Account**
   - Sign up at [sudomock.com](https://sudomock.com)
   - Ensure you have available credits

---

## Customizing the Workflows

### Change the PSD File
In `complete-test-workflow.json`, update the `psdUrl` parameter in node "2. Upload PSD":
```json
"psdUrl": "YOUR_PSD_URL_HERE"
```

### Change the Design Image
In `complete-test-workflow.json`, update the `designUrl` in node "5. Render Mockup":
```json
"designUrl": "YOUR_DESIGN_IMAGE_URL_HERE"
```

### Adjust Render Settings
Modify export options in "5. Render Mockup":
```json
"exportOptions": {
  "imageFormat": "webp",  // or "png", "jpeg"
  "imageSize": 1920,      // 100-8000 pixels
  "quality": 95,          // 1-100 for webp/jpeg
  "exportLabel": "custom-label"
}
```

### Add More Smart Objects
To render multiple smart objects, add more items to the `smartObject` array:
```json
"smartObjects": {
  "smartObject": [
    {
      "smartObjectUuid": "uuid-1",
      "designUrl": "https://example.com/design1.png",
      "fitMode": "cover"
    },
    {
      "smartObjectUuid": "uuid-2",
      "designUrl": "https://example.com/design2.png",
      "fitMode": "contain"
    }
  ]
}
```

---

## Expected Results

### Complete Test Workflow
**Success Output:**
```json
{
  "test_status": "✅ All 7 operations tested successfully!",
  "account_email": "your@email.com",
  "uploaded_mockup_uuid": "abc123-def456",
  "mockup_name_before": "Test Mockup - 2026-01-05 02:30",
  "mockup_name_after": "UPDATED Test Mockup - 2026-01-05 02:30",
  "total_mockups_found": "5",
  "rendered_image_url": "https://cdn.sudomock.com/renders/xyz789.webp",
  "deleted_mockup_uuid": "abc123-def456"
}
```

### Rate Limit Test Workflow
**If Rate Limited:**
```json
{
  "error_type": "rate_limit_exceeded",
  "error_message": "Rate limit exceeded (1000 requests/minute). Please retry after 42 seconds.",
  "retry_after_seconds": 42,
  "rate_limit_details": {
    "type": "rate_limit_exceeded",
    "limit": 1000,
    "remaining": 0
  }
}
```

**After Successful Retry:**
```json
{
  "retry_status": "✅ Retry successful after rate limit",
  "account_email": "your@email.com"
}
```

---

## Troubleshooting

### Workflow Import Fails
- Ensure you're using n8n version 1.0.0 or later
- Check that the JSON file is valid (no syntax errors)
- Try importing one workflow at a time

### Node Not Found Error
- Verify SudoMock node is installed: `npm list n8n-nodes-sudomock`
- Restart n8n after installing the node
- Check `~/.n8n/custom/node_modules/` or `~/.n8n/nodes/` for the package

### Credentials Test Fails
- Verify your API key starts with `sm_`
- Check that your API key is active in the [SudoMock Dashboard](https://sudomock.com/dashboard/api-keys)
- Ensure you have an active subscription

### PSD Upload Fails
- Verify the PSD URL is publicly accessible
- Check that the PSD file is under 300MB
- Ensure the URL returns a valid PSD file (not a download page)

### Render Fails
- Verify the mockup UUID exists (check node "3. Get Mockup Details")
- Ensure the smart object UUID is correct
- Check that the design image URL is publicly accessible
- Verify image format is PNG, JPG, or WebP

---

## Rate Limits Reference

| Plan | Concurrent Renders | Concurrent Uploads | Request Rate |
|------|-------------------|--------------------|--------------|
| Free | 1 | 1 | 1000 RPM |
| Starter | 3 | 2 | 1000 RPM |
| Pro | 10 | 5 | 1000 RPM |
| Scale | 25 | 10 | 1000 RPM |

All plans have a base rate limit of **1000 requests per minute** with burst capacity of 1500 requests.

---

## Support

- **Documentation**: [sudomock.com/docs](https://sudomock.com/docs)
- **API Reference**: [sudomock.com/docs/api](https://sudomock.com/docs/api)
- **Email Support**: hello@sudomock.com
- **GitHub Issues**: [github.com/sudomock/n8n-nodes-sudomock/issues](https://github.com/sudomock/n8n-nodes-sudomock/issues)

---

**Happy Automating! 🚀**
