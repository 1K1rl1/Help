const dotenv = require('dotenv');
dotenv.config();

const https = require('https');
const fs = require('fs');
const path = require('path');
const useInsecureTls = (process.env.NODE_TLS_INSECURE || '').toLowerCase() === 'true';
if (useInsecureTls) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  https.globalAgent.options.rejectUnauthorized = false;
  console.warn('WARNING: NODE_TLS_REJECT_UNAUTHORIZED=0 enabled for local insecure TLS testing');
  console.warn('WARNING: HTTPS global agent rejectUnauthorized=false for undici/fetch');
}

const fetch = require('node-fetch');
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

// Set commands (optional)
bot.api.setMyCommands([
  { name: 'hello', description: 'Поприветствовать бота' },
  { name: 'giveExc', description: 'Запросить офлайн Excel файл' },
]);

bot.command('hello', (ctx) => {
  return ctx.reply('Привет! ✨');
});

const UPLOAD_URL = process.env.UPLOAD_URL || INCOMING_URL.replace(/\/incoming$/, '').replace(/\/$/, '') + '/upload_offline';
const TEST_OUTPUT_XLSX = process.env.TEST_OUTPUT_XLSX || 'test_output.xlsx';

async function uploadAndSendExcel(chat_id, filePath) {
  if (!bot || !bot.api || typeof bot.api.uploadFile !== 'function' || typeof bot.api.sendMessageToChat !== 'function') {
    throw new Error('Upload API not available in current bot instance');
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`Файл не найден: ${filePath}`);
  }

  const attachment = await bot.api.uploadFile({ source: filePath });
  const message = await bot.api.sendMessageToChat(chat_id, 'Отправляю файл Excel', {
    attachments: [attachment.toJson()],
  });
  return message;
}

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
    const result = await uploadAndSendExcel(chat_id, filePath);
    console.log('Excel uploaded and sent:', result);
    return ctx.reply('Готово. Файл отправлен в чат.');
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
      // If processing returns a response with notify payload, send it back to MAX
      // (not implemented here — `parse_messenger_errors.py` will call NOTIFY_URL)
    } catch (e) {
      console.error('Failed to forward message:', e.message);
    }
  });
} catch (e) {
  // If the library doesn't support bot.on, fallback to polling commands only
  console.warn('Generic message handler not attached:', e.message);
}

if (bot) {
  bot.start().then(() => console.log('MAX bot started')).catch((e) => console.error(e));
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

app.listen(NOTIFY_PORT, () => console.log(`Notify server listening on ${NOTIFY_PORT}`));
