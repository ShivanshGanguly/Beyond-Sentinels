const path = require("path");

const {
    Client,
    LocalAuth
} = require("whatsapp-web.js");

const qrcode = require("qrcode");


/*
============================================================
CONFIG
============================================================
*/

const isVercel =
    process.env.VERCEL === "1";

const whatsappEnabledByEnv =
    process.env.ENABLE_WHATSAPP === "true";

const whatsappEnabled =
    whatsappEnabledByEnv && !isVercel;


/*
============================================================
STATE
============================================================
*/

let whatsappReady = false;

let currentQRCode = null;

let whatsappState =
    whatsappEnabled
        ? "INITIALIZING"
        : isVercel
            ? "DISABLED_ON_VERCEL"
            : "DISABLED";

let whatsappError = null;

let whatsappClient = null;


/*
============================================================
STARTUP LOG
============================================================
*/

console.log("");
console.log("======================================");
console.log("📱 TAAPSURAKSHAK WHATSAPP");
console.log("======================================");

console.log(
    "Environment:",
    isVercel
        ? "VERCEL"
        : "PERSISTENT SERVER"
);

console.log(
    "WhatsApp enabled:",
    whatsappEnabled
);

console.log(
    "ENABLE_WHATSAPP:",
    process.env.ENABLE_WHATSAPP || "NOT SET"
);

console.log("======================================");
console.log("");


/*
============================================================
CREATE WHATSAPP CLIENT
============================================================
*/

if (whatsappEnabled) {

    try {

        /*
        ----------------------------------------------------
        WhatsApp authentication directory
        ----------------------------------------------------
        */

        const sessionPath =
            path.join(
                process.cwd(),
                "whatsapp-session"
            );

        console.log(
            "📁 WhatsApp session path:",
            sessionPath
        );


        /*
        ----------------------------------------------------
        CREATE CLIENT
        ----------------------------------------------------
        */

        whatsappClient =
            new Client({

                authStrategy:
                    new LocalAuth({

                        clientId:
                            "taapsurakshak",

                        dataPath:
                            sessionPath

                    }),

                authTimeoutMs:
                    0,

                qrMaxRetries:
                    10,

                puppeteer: {

                    headless:
                        true,

                    args: [

                        "--no-sandbox",

                        "--disable-setuid-sandbox",

                        "--disable-dev-shm-usage",

                        "--disable-gpu",

                        "--disable-software-rasterizer",

                        "--disable-extensions",

                        "--no-first-run",

                        "--no-default-browser-check",

                        "--disable-background-networking",

                        "--disable-background-timer-throttling",

                        "--disable-renderer-backgrounding",

                        "--disable-backgrounding-occluded-windows",

                        "--disable-ipc-flooding-protection",

                        "--disable-features=Translate,BackForwardCache"

                    ]

                }

            });


        /*
        ====================================================
        QR EVENT
        ====================================================
        */

        whatsappClient.on(
            "qr",
            async (qr) => {

                console.log("");
                console.log(
                    "======================================"
                );

                console.log(
                    "📱 WHATSAPP QR CODE GENERATED"
                );

                console.log(
                    "======================================"
                );

                console.log(
                    "Scan the QR code using WhatsApp."
                );


                try {

                    currentQRCode =
                        await qrcode.toDataURL(
                            qr
                        );

                    whatsappState =
                        "QR_READY";

                    whatsappReady =
                        false;

                    whatsappError =
                        null;

                    console.log(
                        "✅ QR code converted to Data URL"
                    );

                } catch (error) {

                    console.error(
                        "❌ QR conversion error:",
                        error
                    );

                    currentQRCode =
                        null;

                    whatsappState =
                        "ERROR";

                    whatsappError =
                        error?.message ||
                        String(error);

                }

            }
        );


        /*
        ====================================================
        READY EVENT
        ====================================================
        */

        whatsappClient.on(
            "ready",
            () => {

                console.log("");
                console.log(
                    "======================================"
                );

                console.log(
                    "✅ WHATSAPP WEB CONNECTED"
                );

                console.log(
                    "======================================"
                );


                whatsappReady =
                    true;

                whatsappState =
                    "READY";

                currentQRCode =
                    null;

                whatsappError =
                    null;

            }
        );


        /*
        ====================================================
        AUTHENTICATED EVENT
        ====================================================
        */

        whatsappClient.on(
            "authenticated",
            () => {

                console.log(
                    "🔐 WhatsApp authenticated successfully."
                );

                whatsappState =
                    "AUTHENTICATED";

                whatsappError =
                    null;

            }
        );


        /*
        ====================================================
        AUTH FAILURE
        ====================================================
        */

        whatsappClient.on(
            "auth_failure",
            (message) => {

                console.error(
                    "❌ WhatsApp authentication failure:",
                    message
                );

                whatsappReady =
                    false;

                whatsappState =
                    "AUTH_FAILURE";

                whatsappError =
                    String(message);

                currentQRCode =
                    null;

            }
        );


        /*
        ====================================================
        DISCONNECTED EVENT
        ====================================================
        */

        whatsappClient.on(
            "disconnected",
            (reason) => {

                console.log(
                    "⚠️ WhatsApp disconnected:",
                    reason
                );

                whatsappReady =
                    false;

                whatsappState =
                    "DISCONNECTED";

                whatsappError =
                    String(reason);

                currentQRCode =
                    null;

            }
        );


        /*
        ====================================================
        LOADING SCREEN
        ====================================================
        */

        whatsappClient.on(
            "loading_screen",
            (percent, message) => {

                console.log(
                    `📱 WhatsApp loading: ${percent}% - ${message}`
                );

                if (
                    !whatsappReady
                ) {

                    whatsappState =
                        "LOADING";

                }

            }
        );


        /*
        ====================================================
        CHANGE STATE
        ====================================================
        */

        whatsappClient.on(
            "change_state",
            (state) => {

                console.log(
                    "📱 WhatsApp state changed:",
                    state
                );

            }
        );


        /*
        ====================================================
        MESSAGE LISTENER
        ====================================================
        */

        whatsappClient.on(
            "message",
            async (message) => {

                try {

                    if (
                        message.body &&
                        message.body
                            .trim()
                            .toLowerCase() ===
                        "!ping"
                    ) {

                        await message.reply(
                            "pong"
                        );

                    }

                } catch (error) {

                    console.error(
                        "❌ Message handler error:",
                        error
                    );

                }

            }
        );


        /*
        ====================================================
        INITIALIZE WHATSAPP
        ====================================================
        */

        console.log(
            "🚀 Initializing WhatsApp Web..."
        );


        /*
        ----------------------------------------------------
        90 SECOND INITIALIZATION TIMEOUT
        ----------------------------------------------------
        */

        const initializationTimeout =
            setTimeout(
                () => {

                    console.error("");
                    console.error(
                        "======================================"
                    );

                    console.error(
                        "❌ WHATSAPP INITIALIZATION TIMEOUT"
                    );

                    console.error(
                        "======================================"
                    );

                    console.error(
                        "WhatsApp client.initialize() did not complete within 90 seconds."
                    );

                    console.error(
                        "Current state:",
                        whatsappState
                    );

                    console.error(
                        "Current error:",
                        whatsappError
                    );

                    console.error(
                        "Client exists:",
                        Boolean(whatsappClient)
                    );

                },
                90000
            );


        /*
        ----------------------------------------------------
        INITIALIZE
        ----------------------------------------------------
        */

        whatsappClient
            .initialize()

            .then(
                () => {

                    clearTimeout(
                        initializationTimeout
                    );

                    console.log("");
                    console.log(
                        "======================================"
                    );

                    console.log(
                        "✅ WhatsApp client.initialize() completed"
                    );

                    console.log(
                        "======================================"
                    );

                }
            )

            .catch(
                (error) => {

                    clearTimeout(
                        initializationTimeout
                    );

                    console.error("");
                    console.error(
                        "======================================"
                    );

                    console.error(
                        "❌ WHATSAPP INITIALIZATION ERROR"
                    );

                    console.error(
                        "======================================"
                    );

                    console.error(
                        "Error:",
                        error
                    );

                    console.error(
                        "Error name:",
                        error?.name
                    );

                    console.error(
                        "Error message:",
                        error?.message
                    );

                    console.error(
                        "Error stack:",
                        error?.stack
                    );


                    whatsappReady =
                        false;

                    whatsappState =
                        "ERROR";

                    whatsappError =
                        error?.message ||
                        String(error);

                }
            );


    } catch (error) {

        console.error("");
        console.error(
            "======================================"
        );

        console.error(
            "❌ FAILED TO CREATE WHATSAPP CLIENT"
        );

        console.error(
            "======================================"
        );

        console.error(
            error
        );


        whatsappReady =
            false;

        whatsappState =
            "ERROR";

        whatsappError =
            error?.message ||
            String(error);

    }


} else {

    /*
    ========================================================
    WHATSAPP DISABLED
    ========================================================
    */

    console.log(
        "📱 WhatsApp client is not started."
    );

    console.log(
        "Reason:",
        isVercel
            ? "Running on Vercel."
            : "ENABLE_WHATSAPP is not true."
    );

}

async function loadWhatsAppStatus() {
    try {
        const response = await fetch("/api/whatsapp-status");

        if (!response.ok) {
            console.warn(
                "WhatsApp status temporarily unavailable:",
                response.status
            );
            return;
        }

        const data = await response.json();

        console.log("WhatsApp status:", data);

        if (data.ready === true && data.state === "READY") {
            showWhatsAppSuccess();
        }

        if (data.hasQR && data.qr) {
            showWhatsAppQR(data.qr);
        }

    } catch (error) {
        console.warn(
            "WhatsApp status temporarily unavailable:",
            error
        );
    }
}

/*
============================================================
GET WHATSAPP STATUS
============================================================
*/

function getWhatsAppStatus() {

    return {

        enabled:
            whatsappEnabled,

        ready:
            whatsappReady,

        state:
            whatsappState,

        qr:
            currentQRCode,

        hasQR:
            Boolean(
                currentQRCode
            ),

        error:
            whatsappError

    };

}


/*
============================================================
CHECK WHATSAPP READY
============================================================
*/

function isWhatsAppReady() {

    return whatsappReady;

}


/*
============================================================
FORMAT PHONE NUMBER
============================================================
*/

function formatWhatsAppNumber(
    phoneNumber
) {

    if (
        phoneNumber === undefined ||
        phoneNumber === null
    ) {

        throw new Error(
            "Phone number is required."
        );

    }


    let number =
        String(
            phoneNumber
        )
            .replace(
                /\D/g,
                ""
            );


    /*
    --------------------------------------------------------
    Indian 10-digit number
    --------------------------------------------------------
    */

    if (
        number.length === 10
    ) {

        number =
            "91" +
            number;

    }


    /*
    --------------------------------------------------------
    Validate number
    --------------------------------------------------------
    */

    if (
        number.length < 10
    ) {

        throw new Error(
            "Invalid WhatsApp phone number."
        );

    }


    return (
        number +
        "@c.us"
    );

}


/*
============================================================
SEND WHATSAPP FEEDBACK
============================================================
*/

async function sendWhatsAppFeedback(

    phoneNumber,

    name,

    temperature,

    riskLevel = "UNKNOWN",

    suggestion = ""

) {

    /*
    --------------------------------------------------------
    Check WhatsApp enabled
    --------------------------------------------------------
    */

    if (
        !whatsappEnabled
    ) {

        throw new Error(
            "WhatsApp is not enabled on this server."
        );

    }


    /*
    --------------------------------------------------------
    Check client
    --------------------------------------------------------
    */

    if (
        !whatsappClient
    ) {

        throw new Error(
            "WhatsApp client is not initialized."
        );

    }


    /*
    --------------------------------------------------------
    Check ready
    --------------------------------------------------------
    */

    if (
        !whatsappReady
    ) {

        throw new Error(
            "WhatsApp is not ready. Please scan the QR code first."
        );

    }


    /*
    --------------------------------------------------------
    Format number
    --------------------------------------------------------
    */

    const chatId =
        formatWhatsAppNumber(
            phoneNumber
        );


    /*
    --------------------------------------------------------
    Build message
    --------------------------------------------------------
    */

    const message =

        `🌡️ *TaapSurakshak Heat Alert*\n\n` +

        `Hello ${name || "User"},\n\n` +

        `Current Temperature: ${temperature ?? "N/A"}°C\n` +

        `Risk Level: ${riskLevel || "UNKNOWN"}\n\n` +

        `${suggestion
            ? `💡 Recommendation:\n${suggestion}\n\n`
            : ""
        }` +

        `Stay safe and stay hydrated.\n\n` +

        `— TaapSurakshak`;


    /*
    --------------------------------------------------------
    Verify WhatsApp number
    --------------------------------------------------------
    */

    try {

        const numberDetails =
            await whatsappClient.getNumberId(
                chatId.replace(
                    "@c.us",
                    ""
                )
            );


        if (
            !numberDetails
        ) {

            throw new Error(
                "The provided number is not registered on WhatsApp."
            );

        }


        /*
        ----------------------------------------------------
        Send message
        ----------------------------------------------------
        */

        const response =
            await whatsappClient.sendMessage(
                numberDetails._serialized,
                message
            );


        const messageId =
            response?.id?._serialized ||
            "sent_successfully";


        console.log(
            "✅ WhatsApp message sent:",
            messageId
        );


        return {

            success:
                true,

            messageId

        };


    } catch (error) {

        console.error(
            "❌ WhatsApp send error:",
            error
        );

        throw error;

    }

}


/*
============================================================
EXPORTS
============================================================
*/

module.exports = {

    sendWhatsAppFeedback,

    isWhatsAppReady,

    getWhatsAppStatus

};