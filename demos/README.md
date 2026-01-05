# SudoMock n8n Automation Demos - Production Use Cases

Welcome to the **SudoMock n8n automation demos** collection! This repository showcases real-world workflows that demonstrate how businesses automate mockup generation using the [SudoMock API](https://sudomock.com) and [n8n workflow automation](https://n8n.io).

## 🎯 Who Are These Demos For?

- **E-commerce sellers** running print-on-demand (POD) businesses on Etsy, Shopify, or Redbubble
- **Mobile app developers** publishing to App Store and Google Play
- **Content creators** managing social media for brands, agencies, or personal accounts
- **Digital marketers** creating ad creatives and landing page mockups
- **Freelance designers** streamlining client presentation workflows

---

## 📦 Demo Workflows

### 1. POD Product Creator - Bulk Mockup Generator

**File:** `pod-product-creator-workflow.json`

**Perfect for:** Etsy sellers, Redbubble creators, Shopify merchants, print-on-demand entrepreneurs

Automate the tedious process of creating product mockups for every design variant. This workflow processes multiple designs across multiple product templates (t-shirts, mugs, posters, phone cases, tote bags) in one automated flow.

**What it does:**
- 📂 Monitors Google Drive folder for new designs
- 🔄 Creates design × product template combinations (nested loops)
- 🎨 Renders high-quality mockups for each combination
- 📊 Generates CSV export compatible with Printful and Printify
- 📧 Sends completion email with summary and download link

**Key Features:**
- **Batch Processing:** Process 100+ design-product combinations unattended
- **Integration Ready:** Works with Google Drive, Printful, Printify, Cloudinary
- **Rate Limit Safe:** Sequential processing prevents API throttling
- **Error Resilient:** Continues processing even if individual renders fail

**ROI Example:**
Manual mockup creation: 6 minutes per design-product combo
100 designs × 10 products = 1,000 mockups = **100 hours of manual work**
Automated with this workflow: **~2 hours unattended**

**Use Cases:**
- Launching new design collections across product catalog
- A/B testing designs on different product mockups
- Seasonal product updates (holiday designs, summer collections)
- Bulk preparing mockups for marketplace listings

---

### 2. App Screenshot Generator - Multi-Device Automation

**File:** `app-screenshot-generator-workflow.json`

**Perfect for:** iOS developers, Android developers, indie app makers, SaaS companies, mobile agencies

Eliminate the manual work of creating device-specific screenshots for App Store and Google Play submissions. This workflow integrates with your CI/CD pipeline to auto-generate professionally mocked screenshots.

**What it does:**
- 🔗 Webhook-triggered from GitHub Actions, GitLab CI, or manual
- 📱 Generates screenshots for iPhone 15 Pro, iPad Pro, MacBook Pro mockups
- ⚡ Parallel processing (2 concurrent renders) for speed
- 📦 Creates ZIP archive organized by device and locale
- 💬 Sends Slack notification when ready
- ☁️ Uploads to Google Drive for team access

**Key Features:**
- **CI/CD Integration:** Trigger from deployment pipeline
- **Multi-Device Support:** iPhone, iPad, Mac, Android templates
- **Locale Ready:** Structure output for multi-language submissions
- **Team Collaboration:** Automatic Slack notifications and Drive uploads

**ROI Example:**
Manual screenshot creation: 20 minutes per device × 4 devices = 1.3 hours
Per app update × 12 updates/year = **16 hours annually**
Automated: **~5 minutes per update**

**Use Cases:**
- App Store submission preparation
- Product Hunt launch assets
- Website and landing page device mockups
- Marketing campaign creative generation
- Investor pitch deck automation

---

### 3. Content Creator Mockup Batch - Social Media Automation

**File:** `content-creator-mockup-batch-workflow.json`

**Perfect for:** Instagram creators, LinkedIn influencers, agency content teams, social media managers

Transform a single design into platform-optimized mockups across all social networks automatically. This workflow watches for new designs and generates perfectly sized, branded variants for each platform.

**What it does:**
- 👀 Watches Google Drive folder for new design uploads
- 📐 Creates mockup × platform combinations (Instagram, Twitter, LinkedIn, Facebook)
- 🖼️ Generates variants: Square (1:1), Story (9:16), Wide (16:9), Portrait (4:5)
- 🎨 Adds custom watermark/branding automatically
- 📅 Schedules posts to Buffer with optimal timing
- 📁 Organizes files by platform in Google Drive

**Key Features:**
- **Platform Optimization:** Correct aspect ratios and dimensions for each network
- **Branding Automation:** Watermark, logo, and color overlay options
- **Buffer Integration:** Auto-schedule to Instagram, Twitter, LinkedIn
- **Folder Organization:** Clean file structure by platform and date

**ROI Example:**
Manual social media prep: 15 minutes per design × 4 platforms = 1 hour
Weekly content (5 designs) = **5 hours/week** = 260 hours/year
Automated: **30 minutes/week**

**Use Cases:**
- Weekly social media content batches
- Product launch campaigns across platforms
- Client showcase portfolio updates
- Course or ebook promotional graphics
- Brand consistency across channels

---

## ⚠️ Important Notice

> **These workflows are conceptual implementations** designed to showcase production-ready automation patterns. While they demonstrate real-world use cases and follow best practices for n8n workflow design, **they have not been extensively tested in live production environments**.
>
> We recommend using these as **starting points and inspiration** for building your own custom automation. You'll likely need to adapt node configurations, add error handling specific to your environment, and test thoroughly before deploying to production.
>
> Consider these **advanced templates** rather than plug-and-play solutions.

---

## 🚀 Getting Started

### Prerequisites

Before using these workflows, you'll need:

**1. n8n Workflow Automation**
- Self-hosted n8n (v1.0.0+) or n8n.cloud account
- [Download n8n](https://n8n.io) or [Try n8n Cloud](https://n8n.cloud)

**2. SudoMock API Account**
- Free tier: 500 API credits (no credit card required)
- [Sign up at sudomock.com](https://sudomock.com)
- Generate API key from dashboard

**3. PSD Mockup Templates**
- Upload your PSD files with smart object layers
- Or find free mockups: [Freepik](https://freepik.com), [Mockup World](https://mockupworld.co)
- Templates needed:
  - **POD workflow:** Product mockups (t-shirt, mug, poster, etc.)
  - **App workflow:** Device mockups (iPhone 15, iPad Pro, MacBook)
  - **Content workflow:** Context mockups (laptop, phone, billboard)

**4. Third-Party Integrations (optional)**
- **Google Drive** - For file storage and triggers
- **Buffer** - For social media scheduling (Content Creator workflow)
- **Slack** - For team notifications

### Rate Limits & Plans

SudoMock operates on a **credit-based system**. All plans include:
- **1000 requests/minute** base rate limit
- Parallel rendering limits based on plan tier

**Free Tier:**
- 500 API credits (one-time)
- 1 parallel render
- Perfect for testing these workflows

**Paid Plans:**
- Faster parallel processing (3-25 concurrent renders)
- Volume discounts available
- [See full pricing](https://sudomock.com/pricing)

### Installation

```bash
# Install SudoMock n8n node
cd ~/.n8n/nodes
npm install n8n-nodes-sudomock

# Restart n8n
pm2 restart n8n
```

### Setup

1. **Get API Key:** [SudoMock Dashboard](https://sudomock.com/dashboard/api-keys)
2. **Add Credentials:** n8n → Settings → Credentials → Create New → SudoMock API
3. **Upload PSDs:** Upload your mockup templates via SudoMock dashboard
4. **Import Workflow:** Copy JSON and paste into n8n blank workflow
5. **Configure Nodes:** Update folder IDs, webhook URLs, and credentials
6. **Test:** Run workflow with test data before production use

---

## 📚 Learn More

### SudoMock Resources
- [API Documentation](https://sudomock.com/docs/api)
- [PSD Template Guidelines](https://sudomock.com/docs/templates)
- [Pricing & Rate Limits](https://sudomock.com/pricing)

### n8n Resources
- [n8n Documentation](https://docs.n8n.io)
- [Community Forum](https://community.n8n.io)
- [Workflow Templates](https://n8n.io/workflows)

### Integration Guides
- [Google Drive Setup](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googledrive/)
- [Webhook Configuration](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/)
- [Buffer Integration](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.buffer/)

---

## 💡 Customization Ideas

### Add Your Own Nodes

**Email Notifications:**
Add email nodes to notify stakeholders when batches complete

**Airtable/Notion Logging:**
Track render history and costs in your project management tool

**Slack Webhooks:**
Real-time team notifications for workflow status

**Cloud Storage:**
Upload to AWS S3, Cloudflare R2, or Azure Blob

### Workflow Enhancements

**Conditional Logic:**
Route different design types to different templates

**AI Integration:**
Use GPT-4 Vision to auto-categorize designs before rendering

**Analytics:**
Track which mockup styles perform best in ads

**Scheduling:**
Run workflows during off-peak hours for cost optimization

---

## 🤝 Community & Support

**Found a bug or have a suggestion?**
Open an issue on [GitHub](https://github.com/sudomock/n8n-nodes-sudomock/issues)

**Built something cool with these demos?**
Share your workflow in [n8n Community](https://community.n8n.io)

**Need custom development?**
Reach out: hello@sudomock.com

---

## 📄 License

These demo workflows are provided under MIT License. Feel free to use, modify, and share them in your projects.

---

**Ready to automate your mockup workflow?** [Get started with SudoMock](https://sudomock.com) and [n8n](https://n8n.io) today! 🚀
