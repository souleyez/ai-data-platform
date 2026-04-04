import crypto from 'node:crypto';
import { handleChannelIngress } from './channel-ingress.js';
import { getWecomChannelConfig, type WecomChannelConfig } from './wecom-channel-config.js';

export type WecomCallbackQuery = {
  msg_signature?: string;
  timestamp?: string;
  nonce?: string;
  echostr?: string;
};

export type WecomInboundMessage = {
  ToUserName?: string;
  FromUserName?: string;
  CreateTime?: string;
  MsgType?: string;
  Content?: string;
  MsgId?: string;
  AgentID?: string;
  Event?: string;
};

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function buildSignature(token: string, timestamp: string, nonce: string, encrypted: string) {
  return crypto
    .createHash('sha1')
    .update([token, timestamp, nonce, encrypted].sort().join(''), 'utf8')
    .digest('hex');
}

function decodeEncodingAesKey(encodingAesKey: string) {
  const key = Buffer.from(`${normalizeText(encodingAesKey)}=`, 'base64');
  if (key.length !== 32) {
    throw new Error('invalid wecom encoding aes key');
  }
  return key;
}

function stripPkcs7(buffer: Buffer) {
  const pad = buffer[buffer.length - 1] || 0;
  if (!pad || pad > 32) return buffer;
  return buffer.subarray(0, buffer.length - pad);
}

function addPkcs7(buffer: Buffer) {
  const blockSize = 32;
  const pad = blockSize - (buffer.length % blockSize || blockSize);
  return Buffer.concat([buffer, Buffer.alloc(pad, pad)]);
}

function parseDecryptedPayload(buffer: Buffer, expectedCorpId: string) {
  const content = stripPkcs7(buffer);
  const msgLength = content.readUInt32BE(16);
  const xmlStart = 20;
  const xmlEnd = xmlStart + msgLength;
  const xml = content.subarray(xmlStart, xmlEnd).toString('utf8');
  const corpId = content.subarray(xmlEnd).toString('utf8');
  if (expectedCorpId && corpId !== expectedCorpId) {
    throw new Error('wecom corp id mismatch');
  }
  return { xml, corpId };
}

export function decryptWecomMessage(encrypted: string, encodingAesKey: string, expectedCorpId: string) {
  const aesKey = decodeEncodingAesKey(encodingAesKey);
  const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, aesKey.subarray(0, 16));
  decipher.setAutoPadding(false);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(normalizeText(encrypted), 'base64')),
    decipher.final(),
  ]);
  return parseDecryptedPayload(decrypted, expectedCorpId);
}

export function encryptWecomMessage(xml: string, encodingAesKey: string, corpId: string) {
  const aesKey = decodeEncodingAesKey(encodingAesKey);
  const random = crypto.randomBytes(16);
  const xmlBuffer = Buffer.from(xml, 'utf8');
  const corpBuffer = Buffer.from(corpId, 'utf8');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(xmlBuffer.length, 0);
  const raw = addPkcs7(Buffer.concat([random, length, xmlBuffer, corpBuffer]));
  const cipher = crypto.createCipheriv('aes-256-cbc', aesKey, aesKey.subarray(0, 16));
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(raw), cipher.final()]).toString('base64');
}

export function parseSimpleXml(xml: string) {
  const normalized = String(xml || '').trim();
  const inner = normalized.startsWith('<xml>') && normalized.endsWith('</xml>')
    ? normalized.slice(5, -6)
    : normalized;
  const result: Record<string, string> = {};
  const tagPattern = /<([A-Za-z0-9_]+)>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/\1>/g;
  let match: RegExpExecArray | null = null;
  while ((match = tagPattern.exec(inner))) {
    const key = match[1];
    const value = (match[2] ?? match[3] ?? '').trim();
    result[key] = value;
  }
  return result;
}

function wrapCdata(value: string) {
  return `<![CDATA[${String(value || '')}]]>`;
}

function buildTextReplyXml(input: { toUserName: string; fromUserName: string; content: string }) {
  return [
    '<xml>',
    `<ToUserName>${wrapCdata(input.toUserName)}</ToUserName>`,
    `<FromUserName>${wrapCdata(input.fromUserName)}</FromUserName>`,
    `<CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime>`,
    `<MsgType>${wrapCdata('text')}</MsgType>`,
    `<Content>${wrapCdata(input.content)}</Content>`,
    '</xml>',
  ].join('');
}

function buildEncryptedEnvelope(input: {
  encrypt: string;
  token: string;
  timestamp: string;
  nonce: string;
}) {
  const msgSignature = buildSignature(input.token, input.timestamp, input.nonce, input.encrypt);
  return [
    '<xml>',
    `<Encrypt>${wrapCdata(input.encrypt)}</Encrypt>`,
    `<MsgSignature>${wrapCdata(msgSignature)}</MsgSignature>`,
    `<TimeStamp>${input.timestamp}</TimeStamp>`,
    `<Nonce>${wrapCdata(input.nonce)}</Nonce>`,
    '</xml>',
  ].join('');
}

function verifySignature(config: WecomChannelConfig, query: WecomCallbackQuery, encrypted: string) {
  const timestamp = normalizeText(query.timestamp);
  const nonce = normalizeText(query.nonce);
  const msgSignature = normalizeText(query.msg_signature);
  if (!timestamp || !nonce || !msgSignature) {
    throw new Error('missing wecom signature query');
  }
  const expected = buildSignature(config.token, timestamp, nonce, encrypted);
  if (expected !== msgSignature) {
    throw new Error('invalid wecom signature');
  }
  return { timestamp, nonce };
}

export async function verifyWecomCallbackUrl(routeKey: string, query: WecomCallbackQuery) {
  const config = await getWecomChannelConfig(routeKey);
  if (!config) throw new Error('wecom route not configured');
  const echostr = normalizeText(query.echostr);
  if (!echostr) throw new Error('wecom echostr is required');
  verifySignature(config, query, echostr);
  const decrypted = decryptWecomMessage(echostr, config.encodingAesKey, config.corpId);
  return decrypted.xml;
}

export async function handleWecomCallbackMessage(input: {
  routeKey: string;
  query: WecomCallbackQuery;
  rawXml: string;
}) {
  const config = await getWecomChannelConfig(input.routeKey);
  if (!config) throw new Error('wecom route not configured');

  const envelope = parseSimpleXml(input.rawXml);
  const encrypted = normalizeText(envelope.Encrypt);
  if (!encrypted) throw new Error('wecom encrypted payload is required');
  const { timestamp, nonce } = verifySignature(config, input.query, encrypted);
  const decrypted = decryptWecomMessage(encrypted, config.encodingAesKey, config.corpId);
  const inbound = parseSimpleXml(decrypted.xml) as WecomInboundMessage;
  const msgType = normalizeText(inbound.MsgType).toLowerCase();
  const content = normalizeText(inbound.Content);
  const senderId = normalizeText(inbound.FromUserName);
  const tenantId = normalizeText(inbound.ToUserName) || config.corpId;

  if (msgType !== 'text' || !content) {
    return { type: 'success' as const, body: 'success', botId: '' };
  }

  const result = await handleChannelIngress({
    channel: 'wecom',
    prompt: content,
    routeKey: input.routeKey,
    tenantId,
    senderId,
    senderName: senderId,
    sessionUser: senderId ? `wecom:${senderId}` : undefined,
  });

  const replyXml = buildTextReplyXml({
    toUserName: normalizeText(inbound.FromUserName),
    fromUserName: normalizeText(inbound.ToUserName),
    content: normalizeText(result.result.message?.content || '') || 'success',
  });
  const encrypt = encryptWecomMessage(replyXml, config.encodingAesKey, config.corpId);
  const responseNonce = crypto.randomBytes(8).toString('hex');
  const responseTimestamp = String(Math.floor(Date.now() / 1000));
  return {
    type: 'xml' as const,
    body: buildEncryptedEnvelope({
      encrypt,
      token: config.token,
      timestamp: responseTimestamp,
      nonce: responseNonce,
    }),
    botId: result.bot.id,
  };
}
