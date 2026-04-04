import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-channels-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;
delete process.env.OPENCLAW_GATEWAY_URL;
delete process.env.OPENCLAW_GATEWAY_TOKEN;

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const appModule = await importFresh<typeof import('../src/app.js')>(
  '../src/app.js',
);
const app = appModule.createApp();
const wecomModule = await importFresh<typeof import('../src/lib/wecom-callback.js')>(
  '../src/lib/wecom-callback.js',
);

const WECOM_ROUTE_KEY = 'corp-default';
const WECOM_TOKEN = 'wecom-token';
const WECOM_ENCODING_AES_KEY = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';
const WECOM_CORP_ID = 'wx-test-corp';

function buildWecomSignature(token: string, timestamp: string, nonce: string, encrypted: string) {
  return crypto
    .createHash('sha1')
    .update([token, timestamp, nonce, encrypted].sort().join(''), 'utf8')
    .digest('hex');
}

async function seedWecomRoute() {
  const configDir = path.join(storageRoot, 'config');
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(
    path.join(configDir, 'wecom-channels.json'),
    JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      items: [{
        routeKey: WECOM_ROUTE_KEY,
        token: WECOM_TOKEN,
        encodingAesKey: WECOM_ENCODING_AES_KEY,
        corpId: WECOM_CORP_ID,
        enabled: true,
      }],
    }, null, 2),
    'utf8',
  );
}

test.after(async () => {
  await app.close();
  await fs.rm(storageRoot, { recursive: true, force: true });
});

test('channel test route should require access key and resolve a wecom bot by route key', async () => {
  const setup = await app.inject({
    method: 'POST',
    url: '/api/intelligence-mode/setup-full',
    payload: {
      code: '4321',
      label: 'channel-test',
    },
  });
  assert.equal(setup.statusCode, 200);

  const denied = await app.inject({
    method: 'POST',
    url: '/api/channels/wecom/messages/test',
    payload: {
      prompt: '合同协议里最近有什么文档',
      routeKey: 'corp-default',
    },
  });
  assert.equal(denied.statusCode, 401);

  const createBot = await app.inject({
    method: 'POST',
    url: '/api/bots',
    headers: {
      'x-access-key': '4321',
    },
    payload: {
      id: 'wecom-assistant',
      name: '企业微信助手',
      visibleLibraryKeys: ['contract'],
      channelBindings: [
        { channel: 'web', enabled: true },
        { channel: 'wecom', enabled: true, routeKey: 'corp-default' },
      ],
    },
  });
  assert.equal(createBot.statusCode, 200);

  const response = await app.inject({
    method: 'POST',
    url: '/api/channels/wecom/messages/test',
    headers: {
      'x-access-key': '4321',
    },
    payload: {
      prompt: '合同协议里最近有什么文档',
      routeKey: 'corp-default',
      senderId: 'zhangsan',
      senderName: '张三',
    },
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.channel, 'wecom');
  assert.equal(body.bot.id, 'wecom-assistant');
  assert.equal(body.sessionUser, 'wecom:zhangsan');
  assert.equal(body.sender.id, 'zhangsan');
  assert.equal(body.result.orchestration.botId, 'wecom-assistant');
});

test('channel test route should resolve a teams bot by explicit botId and reject unsupported channels', async () => {
  const createBot = await app.inject({
    method: 'POST',
    url: '/api/bots',
    headers: {
      'x-access-key': '4321',
    },
    payload: {
      id: 'teams-assistant',
      name: 'Teams 助手',
      visibleLibraryKeys: ['paper', '简历'],
      channelBindings: [
        { channel: 'web', enabled: true },
        { channel: 'teams', enabled: true, routeKey: 'team-default' },
      ],
    },
  });
  assert.equal(createBot.statusCode, 200);

  const response = await app.inject({
    method: 'POST',
    url: '/api/channels/teams/messages/test',
    headers: {
      'x-access-key': '4321',
    },
    payload: {
      prompt: '合同协议里最近有什么文档',
      botId: 'teams-assistant',
      senderId: 'lisi',
    },
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.channel, 'teams');
  assert.equal(body.bot.id, 'teams-assistant');
  assert.equal(body.result.orchestration.botId, 'teams-assistant');

  const unsupported = await app.inject({
    method: 'POST',
    url: '/api/channels/slack/messages/test',
    headers: {
      'x-access-key': '4321',
    },
    payload: {
      prompt: 'hello',
    },
  });
  assert.equal(unsupported.statusCode, 400);
});

test('wecom callback should verify url and route encrypted text message by route key', async () => {
  await seedWecomRoute();

  const createBot = await app.inject({
    method: 'POST',
    url: '/api/bots',
    headers: {
      'x-access-key': '4321',
    },
    payload: {
      id: 'wecom-callback-assistant',
      name: 'WeCom Callback Assistant',
      visibleLibraryKeys: ['contract'],
      channelBindings: [
        { channel: 'web', enabled: true },
        { channel: 'wecom', enabled: true, routeKey: WECOM_ROUTE_KEY },
      ],
    },
  });
  assert.equal(createBot.statusCode, 200);

  const echoPlain = 'ok';
  const echoEncrypted = wecomModule.encryptWecomMessage(
    echoPlain,
    WECOM_ENCODING_AES_KEY,
    WECOM_CORP_ID,
  );
  const verifyTimestamp = '1712200000';
  const verifyNonce = 'nonce-verify';
  const verifySignature = buildWecomSignature(
    WECOM_TOKEN,
    verifyTimestamp,
    verifyNonce,
    echoEncrypted,
  );

  const verify = await app.inject({
    method: 'GET',
    url: `/api/channels/wecom/callback/${WECOM_ROUTE_KEY}?msg_signature=${verifySignature}&timestamp=${verifyTimestamp}&nonce=${verifyNonce}&echostr=${encodeURIComponent(echoEncrypted)}`,
  });
  assert.equal(verify.statusCode, 200);
  assert.equal(verify.body, echoPlain);

  const plaintextMessage = [
    '<xml>',
    '<ToUserName><![CDATA[wx-test-corp]]></ToUserName>',
    '<FromUserName><![CDATA[zhangsan]]></FromUserName>',
    '<CreateTime>1712200001</CreateTime>',
    '<MsgType><![CDATA[text]]></MsgType>',
    '<Content><![CDATA[合同协议里最近有什么文档]]></Content>',
    '<MsgId>1234567890</MsgId>',
    '<AgentID><![CDATA[1000002]]></AgentID>',
    '</xml>',
  ].join('');
  const encryptedMessage = wecomModule.encryptWecomMessage(
    plaintextMessage,
    WECOM_ENCODING_AES_KEY,
    WECOM_CORP_ID,
  );
  const callbackTimestamp = '1712200002';
  const callbackNonce = 'nonce-callback';
  const callbackSignature = buildWecomSignature(
    WECOM_TOKEN,
    callbackTimestamp,
    callbackNonce,
    encryptedMessage,
  );

  const callback = await app.inject({
    method: 'POST',
    url: `/api/channels/wecom/callback/${WECOM_ROUTE_KEY}?msg_signature=${callbackSignature}&timestamp=${callbackTimestamp}&nonce=${callbackNonce}`,
    headers: {
      'content-type': 'text/xml',
    },
    payload: `<xml><Encrypt><![CDATA[${encryptedMessage}]]></Encrypt></xml>`,
  });
  assert.equal(callback.statusCode, 200);
  assert.match(callback.body, /<Encrypt><!\[CDATA\[/);

  const responseEnvelope = wecomModule.parseSimpleXml(callback.body);
  const decryptedReply = wecomModule.decryptWecomMessage(
    String(responseEnvelope.Encrypt || ''),
    WECOM_ENCODING_AES_KEY,
    WECOM_CORP_ID,
  );
  const replyXml = wecomModule.parseSimpleXml(decryptedReply.xml);
  assert.equal(replyXml.ToUserName, 'zhangsan');
  assert.equal(replyXml.MsgType, 'text');
  assert.ok(String(replyXml.Content || '').trim());
});
