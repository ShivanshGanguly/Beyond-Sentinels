const puppeteer = require("puppeteer");

(async () => {
    console.log("🚀 Starting standalone Puppeteer test...");

    const browser = await puppeteer.launch({
        headless: true,
        dumpio: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu"
        ]
    });

    console.log("✅ Browser launched");

    const page = await browser.newPage();

    console.log("🌐 Loading WhatsApp Web...");

    const response = await page.goto(
        "https://web.whatsapp.com",
        {
            waitUntil: "domcontentloaded",
            timeout: 60000
        }
    );

    console.log(
        "✅ Page loaded. HTTP status:",
        response ? response.status() : "NO RESPONSE"
    );

    console.log(
        "📄 Page title:",
        await page.title()
    );

    console.log(
        "🔗 Page URL:",
        page.url()
    );

    await new Promise(resolve => setTimeout(resolve, 10000));

    console.log(
        "📄 Final title:",
        await page.title()
    );

    console.log(
        "🔗 Final URL:",
        page.url()
    );

    await browser.close();

    console.log("🏁 Test finished");
})();