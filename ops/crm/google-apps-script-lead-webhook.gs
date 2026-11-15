/**
 * ScholarMind Zero-Cost (₹0 / $0) Lead CRM Webhook Receiver — Google Apps Script
 *
 * Receives signed JSON lead payloads from `routeMarketingLead` (`apps/web/src/lib/worker/tasks.ts`),
 * verifies the HMAC-SHA256 `x-scholarmind-signature` (`sha256=<hex>`), deduplicates by `id`,
 * appends a structured row to Google Sheets, and optionally emails the founder/admissions team.
 *
 * Setup (100% Free):
 * 1. Create a Google Sheet with a tab named `Leads`.
 * 2. Open Extensions → Apps Script and paste this file into `Code.gs`.
 * 3. In Project Settings → Script Properties, set:
 *      - `WEBHOOK_INGEST_TOKEN`    = random >=32-char token appended to the Web App URL (`?token=...`)
 *      - `LEAD_CRM_WEBHOOK_SECRET` = optional >=32-char HMAC secret (verified when `signature` param is forwarded)
 *      - `NOTIFY_EMAIL`            = optional founder/sales email for instant alerts
 * 4. Click Deploy → New deployment → Web app:
 *      - Execute as: Me
 *      - Who has access: Anyone (fail-closed token/HMAC check enforced below)
 * 5. Set `LEAD_CRM_WEBHOOK_URL` on Vercel (`school-sis-web`) to:
 *      `https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec?token=<WEBHOOK_INGEST_TOKEN>`
 */

var SHEET_NAME = 'Leads';
var HEADERS = [
  'Received At (UTC)',
  'Lead ID',
  'School Name',
  'Contact Name',
  'Contact Email',
  'Student Capacity',
  'Pain Points',
  'Consented At',
  'Consent Version',
  'UTM Source',
  'UTM Medium',
  'UTM Campaign',
  'Source URL',
  'Referrer',
];

function bytesToHex_(bytes) {
  var hex = [];
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    hex.push(('0' + b.toString(16)).slice(-2));
  }
  return hex.join('');
}

function constantTimeEquals_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false;
  }
  var diff = 0;
  for (var i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function getOrCreateSheet_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
  }
  return sheet;
}

function leadAlreadyRecorded_(sheet, leadId) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return false;
  var values = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(leadId)) return true;
  }
  return false;
}

function doPost(e) {
  var props = PropertiesService.getScriptProperties();
  var ingestToken = props.getProperty('WEBHOOK_INGEST_TOKEN') || '';
  var hmacSecret = props.getProperty('LEAD_CRM_WEBHOOK_SECRET') || '';
  if (ingestToken.length < 32 && hmacSecret.length < 32) {
    return jsonResponse_({ ok: false, error: 'Webhook authentication is not configured.' });
  }

  var rawBody = e && e.postData && e.postData.contents ? e.postData.contents : '';
  if (!rawBody) {
    return jsonResponse_({ ok: false, error: 'Empty request body.' });
  }

  // Fail closed: Google Apps Script `doPost(e)` strips custom HTTP headers, so require either
  // a constant-time match on `?token=<WEBHOOK_INGEST_TOKEN>` or a forwarded `?signature=sha256=<hex>`.
  var suppliedToken = (e && e.parameter && e.parameter.token) || '';
  var suppliedSig = (e && e.parameter && e.parameter.signature) || '';
  var tokenValid = ingestToken.length >= 32 && constantTimeEquals_(suppliedToken, ingestToken);
  var sigValid = false;
  if (hmacSecret.length >= 32 && suppliedSig) {
    var computedHex = bytesToHex_(
      Utilities.computeHmacSha256Signature(rawBody, hmacSecret, Utilities.Charset.UTF_8)
    );
    sigValid = constantTimeEquals_(suppliedSig.replace(/^sha256=/, ''), computedHex);
  }
  if (!tokenValid && !sigValid) {
    return jsonResponse_({ ok: false, error: 'Unauthorized webhook request.' });
  }

  var lead = JSON.parse(rawBody);
  if (!lead || !lead.id || !lead.contactEmail) {
    return jsonResponse_({ ok: false, error: 'Invalid lead payload.' });
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getOrCreateSheet_();
    if (!leadAlreadyRecorded_(sheet, lead.id)) {
      var attribution = lead.attribution || {};
      sheet.appendRow([
        new Date().toISOString(),
        lead.id,
        lead.schoolName || '',
        lead.contactName || '',
        lead.contactEmail || '',
        lead.studentCapacity || 0,
        lead.painPoints || '',
        lead.consentedAt || '',
        lead.consentVersion || '',
        attribution.source || '',
        attribution.medium || '',
        attribution.campaign || '',
        lead.sourceUrl || '',
        lead.referrer || '',
      ]);

      var notifyEmail = props.getProperty('NOTIFY_EMAIL');
      if (notifyEmail) {
        MailApp.sendEmail({
          to: notifyEmail,
          subject: '[ScholarMind Lead] ' + (lead.schoolName || 'New School Demo Request'),
          body:
            'School: ' + (lead.schoolName || '') + '\n' +
            'Contact: ' + (lead.contactName || '') + ' <' + (lead.contactEmail || '') + '>\n' +
            'Capacity: ' + (lead.studentCapacity || 0) + '\n' +
            'Pain Points: ' + (lead.painPoints || '—') + '\n' +
            'Lead ID: ' + lead.id,
        });
      }
    }
    return jsonResponse_({ ok: true, id: lead.id, deduplicated: true });
  } finally {
    lock.releaseLock();
  }
}
