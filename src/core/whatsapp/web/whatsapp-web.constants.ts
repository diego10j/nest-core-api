export const WHATSAPP_CONFIG = {
    sessionPath: 'session',
    clientId: 'whatsapp-client',
    maxConnectionAttempts: 5,
    reconnectDelay: 5000,
    webVersion: '2.2412.54',
    puppeteerArgs: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--single-process'
    ],
    maxMessagesPerMinute: 10, // Límite para evitar baneos
    initializationTimeout: 30000, // 30 segundos
    maxInitializationAttempts: 3,
};

export const WEB_VERSION_CACHE = {
    type: 'remote' as const,
    remotePath: `https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/${WHATSAPP_CONFIG.webVersion}.html`
};