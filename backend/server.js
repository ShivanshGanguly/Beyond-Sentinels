import express from 'express';
import qrcode from 'qrcode-terminal';
import pkg from 'whatsapp-web.js';
import aiRoutes from './aiService.js';

const { Client, LocalAuth } = pkg;
const app = express();

app.use(express.json());
app.use(express.static('public'));
app.use(aiRoutes);

const PORT = process.env.PORT || 3000;

// Initialize WhatsApp Web Client
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './whatsapp-session' }),
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1014111620-alpha.html',
    },
    puppeteer: {
        headless: true,
        // macOS path to system Google Chrome
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        bypassCSP: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-features=IsolateOrigins,site-per-process,MemorySaverMode',
            '--memory-pressure-off'
        ]
    }
});

// Terminal QR Code Handler
client.on('qr', (qr) => {
    console.log('\nScan this QR code with WhatsApp:\n');
    qrcode.generate(qr, { small: true });
});

// Ready Event Handler
client.on('ready', () => {
    console.log('✅ WhatsApp Web connected and ready!');
});

// Message Listener Handler
client.on('message', async (message) => {
    if (message.body.toLowerCase() === '!ping') {
        await message.reply('pong');
    }
});

// Endpoint to Send WhatsApp Messages
app.post('/api/send-message', async (req, res) => {
    const { number, message } = req.body;
    if (!number || !message) {
        return res.status(400).json({ error: 'Missing parameters' });
    }

    try {
        const cleanNumber = number.replace(/\D/g, '');
        const numberDetails = await client.getNumberId(cleanNumber);

        if (!numberDetails) {
            return res.status(400).json({ error: 'The provided number is not registered on WhatsApp.' });
        }

        const response = await client.sendMessage(numberDetails._serialized, message);
        const messageId = response?.id?._serialized || 'sent_successfully';

        return res.json({ success: true, messageId: messageId });
    } catch (error) {
        console.error('Send error caught:', error.message);
        return res.status(500).json({ error: error.message });
    }
});

// Start Server & Initialize WhatsApp Web
app.listen(PORT, async () => {
    console.log(`Server starting on http://localhost:${PORT}`);
    await client.initialize();
});