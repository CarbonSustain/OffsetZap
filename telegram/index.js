import pkg from "@xmtp/xmtp-js";
const { Client } = pkg;
import { Wallet } from "ethers";
import { Telegraf } from "telegraf";
import dotenv from "dotenv";
dotenv.config();

const TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "").toLowerCase();
if (!TELEGRAM_BOT_TOKEN) {
  console.error("Error: TELEGRAM_BOT_TOKEN environment variable is not set.");
  process.exit(1);
}

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
if (!TELEGRAM_CHAT_ID) {
  console.error("Error: TELEGRAM_CHAT_ID environment variable is not set.");
  process.exit(1);
}

const MONITOR_WALLET = (process.env.MONITOR_WALLET || "").toLowerCase();
if (!MONITOR_WALLET) {
  console.error("Error: MONITOR_WALLET environment variable is not set.");
  process.exit(1);
}

async function sendToTelegram(text) {
  await bot.telegram.sendMessage(TELEGRAM_CHAT_ID, text, { parse_mode: "Markdown" });
}

async function setupXMTPClient() {
  const wallet = Wallet.fromMnemonic(process.env.XMTP_MNEMONIC);
  const xmtp = await Client.create(wallet, { env: "production" });
  return xmtp;
}

async function main() {
  const xmtp = await setupXMTPClient();

  // XMTP → Telegram
  console.log(`🔍 Monitoring XMTP messages for ${MONITOR_WALLET}...`);
  for await (const message of await xmtp.conversations.streamAllMessages()) {
    const isRelevant =
      message.senderAddress.toLowerCase() === MONITOR_WALLET ||
      message.recipientAddress.toLowerCase() === MONITOR_WALLET;

    if (isRelevant) {
      const msg = `💬 *XMTP Message*\nFrom: \`${message.senderAddress}\`\nTo: \`${message.recipientAddress}\`\n\n${message.content}`;
      await sendToTelegram(msg);
    }
  }
}

// Telegram → XMTP
bot.command("msg", async ctx => {
  try {
    const [_, toAddress, ...messageParts] = ctx.message.text.split(" ");
    const message = messageParts.join(" ");

    const xmtp = await setupXMTPClient();
    const conversation = await xmtp.conversations.newConversation(toAddress);
    await conversation.send(message);

    await ctx.reply(`✅ Message sent to ${toAddress} via XMTP.`);
  } catch (err) {
    console.error(err);
    await ctx.reply(`⚠️ Failed to send message: ${err.message}`);
  }
});

bot.launch();
main().catch(console.error);
