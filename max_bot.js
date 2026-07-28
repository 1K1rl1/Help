const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '.env') });

const https = require('https');
const http = require('http');
const fs = require('fs');

function configureTlsSecurity() {
  const useInsecureTls = (process.env.NODE_TLS_INSECURE || '').toLowerCase() === 'true';
  const rejectUnauthorizedDisabled = process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0';
  const shouldDisableTls = useInsecureTls || rejectUnauthorizedDisabled || (process.env.ALLOW_INSECURE_TLS || '').toLowerCase() === 'true';

  if (!shouldDisableTls) {
    return;
  }

  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  process.env.NODE_EXTRA_CA_CERTS = process.env.NODE_EXTRA_CA_CERTS || '';

  if (https.globalAgent && https.globalAgent.options) {
    https.globalAgent.options.rejectUnauthorized = false;
  }

  if (http.globalAgent && http.globalAgent.options) {
    http.globalAgent.options.rejectUnauthorized = false;
  }

  console.warn('WARNING: NODE_TLS_REJECT_UNAUTHORIZED=0 enabled for local insecure TLS testing');
  console.warn('WARNING: HTTPS global agent rejectUnauthorized=false for local/self-signed certificates');
}

configureTlsSecurity();

const nodeFetch = require('node-fetch');
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const httpAgent = new http.Agent();
const fetch = (url, options = {}) => {
  const target = typeof url === 'string' ? url : String(url || '');
  const isHttps = /^https:/i.test(target);
  return nodeFetch(url, {
    ...options,
    agent: options.agent || (isHttps ? httpsAgent : httpAgent),
  });
};

global.fetch = fetch;
globalThis.fetch = fetch;
if (nodeFetch.Headers) global.Headers = nodeFetch.Headers;
if (nodeFetch.Request) global.Request = nodeFetch.Request;
if (nodeFetch.Response) global.Response = nodeFetch.Response;

const { Bot } = require('@maxhub/max-bot-api');
const express = require('express');
const bodyParser = require('body-parser');

const BOT_TOKEN = process.env.BOT_TOKEN || process.env.MAX_BOT_TOKEN;
const INCOMING_URL = process.env.INCOMING_URL || 'http://localhost:5000/incoming';
const RETRIES = Number(process.env.OUTGOING_RETRIES || 3);
const NOTIFY_URL = process.env.NOTIFY_URL || 'http://localhost:5000/notify';
const NOTIFY_PORT = Number(process.env.NOTIFY_PORT || 3000);

let bot = null;
if (BOT_TOKEN) {
  try {
    bot = new Bot(BOT_TOKEN);
  } catch (e) {
    console.warn('Failed to initialize Bot with provided token:', e.message);
  }
} else {
  console.warn('BOT_TOKEN not set — notify server will run but bot actions are disabled');
}

if (!BOT_TOKEN) {
  console.warn('No BOT_TOKEN found. Please set a valid MAX bot token in .env before enabling bot features.');
}

// Set commands (optional)
if (bot) {
  bot.api.setMyCommands([
    { name: 'hello', description: 'Поприветствовать бота' },
    { name: 'giveExc', description: 'Запросить офлайн Excel файл' },
  ]);

  bot.command('hello', (ctx) => {
    return ctx.reply('Привет! ✨');
  });
} else {
  console.warn('Bot is not initialized; command registration skipped. Check BOT_TOKEN and .env location.');
}

const UPLOAD_URL = process.env.UPLOAD_URL || INCOMING_URL.replace(/\/incoming$/, '').replace(/\/$/, '') + '/upload_offline';
const TEST_OUTPUT_XLSX = process.env.TEST_OUTPUT_XLSX || 'test_output.xlsx';
const ENABLE_BACKEND_UPLOAD = (process.env.ENABLE_BACKEND_UPLOAD || process.env.FALLBACK_TO_BACKEND || 'false').toLowerCase() === 'true';

async function uploadAndSendExcel(chat_id, filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Файл не найден: ${filePath}`);
  }

  if (ENABLE_BACKEND_UPLOAD && bot && bot.api && typeof bot.api.sendMessageToChat === 'function') {
    try {
      const response = await postWithRetry(UPLOAD_URL, {});
      if (response && response.status === 'ok' && response.link) {
        return await bot.api.sendMessageToChat(chat_id, `Файл доступен по ссылке: ${response.link}`);
      }
    } catch (e) {
      console.warn('Backend upload fallback failed, falling back to local send attempt:', e?.message || e);
    }
  }

  if (!bot || !bot.api || typeof bot.api.uploadFile !== 'function' || typeof bot.api.sendMessageToChat !== 'function') {
    throw new Error('Upload API not available in current bot instance');
  }

  const attachment = await bot.api.uploadFile({ source: filePath });
  const attachmentJson = attachment.toJson();
  console.log('Uploaded attachment json:', JSON.stringify(attachmentJson, null, 2));
  if (!attachmentJson || !attachmentJson.payload || !attachmentJson.payload.token) {
    console.warn('Upload did not return token, attempting buffer upload fallback');
    try {
      const buf = fs.readFileSync(filePath);
      const attachment2 = await bot.api.uploadFile({ source: buf });
      const attachmentJson2 = attachment2.toJson();
      console.log('Uploaded attachment json (buffer):', JSON.stringify(attachmentJson2, null, 2));
      if (attachmentJson2 && attachmentJson2.payload && attachmentJson2.payload.token) {
        try {
          return await bot.api.sendMessageToChat(chat_id, '', { attachments: [attachmentJson2] });
        } catch (err2) {
          console.warn('Send after buffer upload failed, retrying with text:', err2?.message || err2);
          return await bot.api.sendMessageToChat(chat_id, 'Отправляю файл Excel', { attachments: [attachmentJson2] });
        }
      }
    } catch (fallbackErr) {
      console.warn('Buffer upload fallback failed:', fallbackErr?.message || fallbackErr);
    }

    // If backend upload is enabled, try that next
    if (ENABLE_BACKEND_UPLOAD) {
      try {
        const response = await postWithRetry(UPLOAD_URL, {});
        if (response && response.status === 'ok' && response.link) {
          return await bot.api.sendMessageToChat(chat_id, `Файл доступен по ссылке: ${response.link}`);
        }
      } catch (be) {
        console.warn('Backend upload fallback also failed:', be?.message || be);
      }
    }

    throw new Error(`Upload returned invalid attachment token: ${JSON.stringify(attachmentJson)}`);
  }

  try {
    return await bot.api.sendMessageToChat(chat_id, '', {
      attachments: [attachmentJson],
    });
  } catch (err) {
    console.warn('First send attempt failed, retrying with text and attachment:', err?.message || err);
    return await bot.api.sendMessageToChat(chat_id, 'Отправляю файл Excel', {
      attachments: [attachmentJson],
    });
  }
}

if (bot) {
  bot.command('giveExc', async (ctx) => {
    const chat_id = ctx.chatId || ctx.chat?.chat_id || ctx.chat?.id || ctx.message?.chat?.chat_id || ctx.message?.chat?.id;
    const filePath = path.resolve(TEST_OUTPUT_XLSX);

    if (!chat_id) {
      console.error('No chat_id available in context for giveExc:', {
        chat: ctx.chat,
        message: ctx.message,
        chatId: ctx.chatId,
      });
      return ctx.reply('Не удалось определить чат для отправки файла.');
    }

    try {
      // New flow: download export from backend and send that file
      const exportUrl = (process.env.EXPORT_URL || INCOMING_URL.replace(/\/incoming$/, '').replace(/\/$/, '') + '/export_offline');
      const tmpPath = path.resolve(`export_offline-${Date.now()}-${Math.random().toString(36).slice(2,8)}.xlsx`);
      console.log('Downloading export from', exportUrl);
      const res = await fetch(exportUrl);
      if (!res.ok) throw new Error(`export fetch failed status ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      fs.writeFileSync(tmpPath, Buffer.from(arrayBuffer));
      console.log('Export saved to', tmpPath);
      const attachment = await bot.api.uploadFile({ source: tmpPath });
      const attachmentJson = attachment.toJson();
      console.log('Uploaded attachment json:', JSON.stringify(attachmentJson, null, 2));
      if (!attachmentJson || !attachmentJson.payload || !attachmentJson.payload.token) {
        throw new Error(`Upload returned invalid attachment token: ${JSON.stringify(attachmentJson)}`);
      }
      await bot.api.sendMessageToChat(chat_id, 'Файл экспортирован', { attachments: [attachmentJson] });
      try {
        fs.unlinkSync(tmpPath);
      } catch (e) {
        console.warn('Failed to remove temp file:', tmpPath, e?.message || e);
      }
      console.log('Excel exported and sent');
      return ctx.reply('Готово. Файл экспортирован и отправлен.');
    } catch (e) {
      console.error('Failed to upload and send Excel:', e?.message || e);
      if (process.env.FALLBACK_TO_BACKEND === 'true') {
        try {
          const response = await postWithRetry(UPLOAD_URL, {});
          if (response && response.status === 'ok' && response.link) {
            return ctx.reply(`Готово. Ссылка на файл: ${response.link}`);
          }
          if (response && response.error) {
            return ctx.reply(`Не удалось загрузить файл: ${response.error}`);
          }
        } catch (fallbackError) {
          console.error('Fallback upload_offline failed:', fallbackError?.message || fallbackError);
        }
      }
      await ctx.reply(`Ошибка при отправке файла: ${e?.message || 'неизвестная ошибка'}`);
    }
  });
}

async function postWithRetry(url, body, retries = RETRIES) {
  let attempt = 0;
  while (attempt < retries) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      return await res.json().catch(() => ({}));
    } catch (err) {
      attempt += 1;
      console.warn(`POST attempt ${attempt}/${retries} failed:`, err.message);
      if (attempt >= retries) throw err;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

// Generic message handler for MAX incoming messages
if (bot) {
  try {
    bot.on((update) => update.update_type === 'message_created', async (ctx) => {
      try {
        const message = ctx.message || {};
        const body = message.body || {};
        const text = message.text || body.text || '';
        const chat = ctx.chat || message.chat || body.chat || {};
        const recipient = message.recipient || body.recipient || {};
        const realChatId = recipient.chat_id || chat.chat_id || chat.id || ctx.chatId || null;
        const payload = {
          chat: { id: realChatId || 'max', type: chat.type || recipient.chat_type || null },
          text,
          message_id: ctx.messageId || body.mid || null,
          raw: message,
        };

        console.log('Forwarding message to receiver:', JSON.stringify(payload, null, 2));
        const response = await postWithRetry(INCOMING_URL, payload);
        console.log('Receiver responded with:', JSON.stringify(response, null, 2));
      } catch (e) {
        console.error('Failed to forward message:', e.message);
      }
    });
  } catch (e) {
    console.warn('Generic message handler not attached:', e.message);
  }

  bot.start()
    .then(() => console.log('MAX bot started'))
    .catch((e) => {
      console.error('Bot startup failed:', e?.response || e?.message || e);
      console.warn('Notify server will continue to run, but bot features are disabled until a valid token is provided.');
    });
} else {
  console.warn('Bot not initialized; skipping MAX bot startup.');
}

// Simple HTTP server to accept notifications and forward them to MAX
const app = express();
app.use(bodyParser.json());

async function sendToMaxChat(chat_id, text, extra = {}) {
  if (!bot || !bot.api) {
    throw new Error('Bot API is not initialized');
  }

  if (typeof bot.api.sendMessageToChat === 'function') {
    return bot.api.sendMessageToChat(chat_id, text, extra);
  }

  if (typeof bot.api.sendMessage === 'function') {
    return bot.api.sendMessage({ chat_id, text, ...extra });
  }

  if (typeof bot.sendMessage === 'function') {
    return bot.sendMessage(chat_id, text);
  }

  throw new Error('No send method available on bot');
}

app.post('/notify', async (req, res) => {
  const body = req.body || {};
  const chat_id = body.chat_id || (body.chat && body.chat.id) || body.object_id || 'test';
  const text = body.text || body.message || JSON.stringify(body);
  const extra = {
    disable_link_preview: true,
    reply_to_message_id: body.reply_to_message_id,
  };

  try {
    await sendToMaxChat(chat_id, text, extra);
    res.json({ status: 'sent' });
  } catch (err) {
    console.error('Failed to send notify to MAX:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const server = app.listen(NOTIFY_PORT, () => console.log(`Notify server listening on ${NOTIFY_PORT}`));

server.on('error', (err) => {
  console.error('Notify server error:', err && err.message ? err.message : err);
  if (err && err.code === 'EADDRINUSE') {
    console.error(`Port ${NOTIFY_PORT} is already in use. Notify server won't start on that port.`);
    const fallbackPort = Number(process.env.NOTIFY_FALLBACK_PORT || (NOTIFY_PORT + 1));
    console.warn(`Attempting to start notify server on fallback port ${fallbackPort}...`);
    try {
      const fallbackServer = app.listen(fallbackPort, () => console.log(`Notify server listening on fallback port ${fallbackPort}`));
      fallbackServer.on('error', (err2) => {
        console.error('Fallback notify server failed to start:', err2 && err2.message ? err2.message : err2);
        process.exit(1);
      });
    } catch (e) {
      console.error('Failed to start fallback notify server:', e && e.message ? e.message : e);
      process.exit(1);
    }
  } else {
    process.exit(1);
  }
});
