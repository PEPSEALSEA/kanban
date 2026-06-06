import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { JWT } from 'google-auth-library';

type Bindings = {
  SPREADSHEET_ID: string;
  DISCORD_WEBHOOK_URL: string;
  SUMMARY_WEBHOOK_URL: string;
  GOOGLE_CLIENT_EMAIL: string;
  GOOGLE_PRIVATE_KEY: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', cors());

const ADMIN_EMAILS = new Set([
  'pepsealsea@gmail.com',
  'iampep2009@gmail.com',
  'sealseapep@gmail.com',
]);

function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.has(email.trim().toLowerCase());
}

const SHEETS = {
  HOMEWORK: "Homework",
  USERS: "Users",
  PROGRESS: "Progress",
  URLS: "URLs",
  COMMENTS: "Comments",
  LEARNING_CONTENT: "LearningContent",
  SUBJECTS: "Subjects",
  ANALYTICS: "Analytics",
  AUDIO_PERMISSIONS: "AudioPermissions",
};

const EXPECTED_HEADERS = {
  [SHEETS.HOMEWORK]: ["id", "subject", "title", "description", "deadline", "link_work", "link_image", "note", "created_at"],
  [SHEETS.USERS]: ["email", "name", "picture", "created_at"],
  [SHEETS.PROGRESS]: ["email", "homework_id", "status", "image_url", "updated_at"],
  [SHEETS.LEARNING_CONTENT]: ["id", "date", "subject", "title", "description", "audio_file_id", "audio_url", "attachments", "links", "created_at"],
  [SHEETS.SUBJECTS]: ["id", "name", "color", "created_at"],
  [SHEETS.COMMENTS]: ["homework_id", "owner_email", "commenter_email", "text", "created_at"],
  [SHEETS.URLS]: ["id", "filename", "contentType", "url", "created_at", "uploader", "fileId"],
  [SHEETS.ANALYTICS]: ["id", "event_type", "device_name", "browser", "ip_address", "email", "created_at", "page_visited", "content_id", "fingerprint", "session_id", "metadata"],
  [SHEETS.AUDIO_PERMISSIONS]: ["email", "note", "created_at"]
};

const ANALYTICS_COLUMNS = EXPECTED_HEADERS[SHEETS.ANALYTICS];


// --- AUTH & API HELPERS ---

async function getAuthToken(env: Bindings) {
  const client = new JWT({
    email: env.GOOGLE_CLIENT_EMAIL,
    key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const credentials = await client.authorize();
  return credentials.access_token;
}

async function getSheetValues(env: Bindings, range: string) {
  const token = await getAuthToken(env);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Sheets API error: ${res.statusText}`);
  const data = await res.json() as any;
  return data.values || [];
}

async function appendSheetRow(env: Bindings, range: string, values: any[]) {
  const token = await getAuthToken(env);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: [values] }),
  });
  if (!res.ok) throw new Error(`Sheets API error: ${res.statusText}`);
  return await res.json();
}

async function updateSheetRow(env: Bindings, range: string, values: any[]) {
  const token = await getAuthToken(env);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: [values] }),
  });
  if (!res.ok) throw new Error(`Sheets API error: ${res.statusText}`);
  return await res.json();
}

async function batchUpdateSheet(env: Bindings, requests: any[]) {
  const token = await getAuthToken(env);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}:batchUpdate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) throw new Error(`Sheets API error: ${res.statusText}`);
  return await res.json();
}

// --- UTILITIES ---

function toObjects(rows: any[][], headers: string[]) {
  if (!rows || rows.length === 0) return [];
  return rows.map(row => {
    const obj: any = {};
    headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : ""; });
    return obj;
  });
}

async function findRowIndexById(env: Bindings, sheetName: string, id: string) {
  const rows = await getSheetValues(env, `${sheetName}!A:A`);
  return rows.findIndex((r: any) => String(r[0]) === String(id));
}

function getMidnightGMT7(date?: Date) {
  const d = date || new Date();
  // Simple GMT+7 shift for comparison
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  const gmt7 = new Date(utc + (3600000 * 7));
  gmt7.setHours(0, 0, 0, 0);
  return gmt7;
}

// --- CORE DATA GETTERS ---

async function getHomeworkList(env: Bindings) {
  const rows = await getSheetValues(env, `${SHEETS.HOMEWORK}!A2:I`);
  return toObjects(rows, ["id", "subject", "title", "description", "deadline", "link_work", "link_image", "note", "created_at"]);
}

async function getUserList(env: Bindings) {
  const rows = await getSheetValues(env, `${SHEETS.USERS}!A2:D`);
  return toObjects(rows, ["email", "name", "picture", "created_at"]);
}

async function getAllProgress(env: Bindings) {
  const rows = await getSheetValues(env, `${SHEETS.PROGRESS}!A2:E`);
  return toObjects(rows, ["email", "homework_id", "status", "image_url", "updated_at"]);
}

async function getProgressByEmail(env: Bindings, email: string) {
  const all = await getAllProgress(env);
  if (!email) return all;
  return all.filter((r: any) => String(r.email).toLowerCase() === email.toLowerCase());
}

async function getHomeworkWithProgress(env: Bindings, email: string) {
  const [homework, progress] = await Promise.all([
    getHomeworkList(env),
    getProgressByEmail(env, email)
  ]);
  const progressMap: any = {};
  progress.forEach((p: any) => { progressMap[p.homework_id] = p.status; });
  return homework.map((hw: any) => ({ ...hw, my_status: progressMap[hw.id] || "pending" }));
}

async function getLearningContent(env: Bindings, date?: string, id?: string) {
  const rows = await getSheetValues(env, `${SHEETS.LEARNING_CONTENT}!A2:J`);
  const data = toObjects(rows, ["id", "date", "subject", "title", "description", "audio_file_id", "audio_url", "attachments", "links", "created_at"]);

  if (id) return data.filter((item: any) => String(item.id) === String(id));
  if (date) {
    const filterDate = new Date(date);
    return data.filter((item: any) => {
      const itemDate = new Date(item.date);
      return itemDate.getFullYear() === filterDate.getFullYear() &&
        itemDate.getMonth() === filterDate.getMonth() &&
        itemDate.getDate() === filterDate.getDate();
    });
  }
  return data;
}

async function getSubjects(env: Bindings) {
  const rows = await getSheetValues(env, `${SHEETS.SUBJECTS}!A2:D`);
  return toObjects(rows, ["id", "name", "color", "created_at"]);
}

async function getAudioPermissions(env: Bindings) {
  try {
    const rows = await getSheetValues(env, `${SHEETS.AUDIO_PERMISSIONS}!A2:A`);
    return rows
      .map((r: any) => String(r[0] || "").trim().toLowerCase())
      .filter(Boolean);
  } catch (e) {
    console.warn("AudioPermissions sheet may not exist yet", e);
    return [];
  }
}

async function getAnalytics(env: Bindings) {
  try {
    const endCol = String.fromCharCode(64 + ANALYTICS_COLUMNS.length);
    const rows = await getSheetValues(env, `${SHEETS.ANALYTICS}!A2:${endCol}`);
    const all = toObjects(rows, ANALYTICS_COLUMNS);
    return all.filter((row: any) => !isAdminEmail(row.email));
  } catch (e) {
    console.warn("Analytics sheet may not exist yet", e);
    return [];
  }
}

// --- TELEGRAM PROXY (Ported from google-apps-script-download.js) ---

async function uploadToTelegram(env: Bindings, blob: Blob, filename: string, contentType: string) {
  const botToken = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) throw new Error("Telegram config missing");

  let method = "sendDocument";
  let payloadField = "document";

  if (contentType.includes('image/')) {
    method = "sendPhoto";
    payloadField = "photo";
  } else if (contentType.includes('audio/')) {
    method = "sendAudio";
    payloadField = "audio";
  }

  const formData = new FormData();
  formData.append("chat_id", chatId);
  formData.append("caption", filename || "Uploaded via StudyFlow");
  formData.append(payloadField, blob, filename);

  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    body: formData
  });

  const result = await res.json() as any;
  if (!result.ok) throw new Error("Telegram API Error: " + result.description);

  let fileId = "";
  if (method === "sendPhoto") {
    fileId = result.result.photo[result.result.photo.length - 1].file_id;
  } else if (method === "sendAudio") {
    fileId = result.result.audio.file_id;
  } else {
    fileId = result.result.document.file_id;
  }

  const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
  const fileResult = await fileRes.json() as any;
  const filePath = fileResult.result.file_path;
  const tempUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

  return { fileId, url: tempUrl };
}

async function getFreshTelegramLink(env: Bindings, fileId: string, contentId?: string, contentType?: string) {
  const botToken = env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN is not configured.");

  const getFileUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`;
  const response = await fetch(getFileUrl);
  const result = await response.json() as any;
  
  if (!result.ok) throw new Error(result.description || "Telegram API Error");

  const filePath = result.result.file_path;
  const newLink = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
  
  if (contentId && contentType) {
    await updateSpreadsheetLink(env, contentId, contentType, fileId, newLink);
  }

  return { url: newLink, fileId: fileId };
}

async function updateSpreadsheetLink(env: Bindings, contentId: string, contentType: string, fileId: string, newUrl: string) {
  const sheetName = contentType === 'homework' ? SHEETS.HOMEWORK : SHEETS.LEARNING_CONTENT;
  const rows = await getSheetValues(env, `${sheetName}!A:I`);
  const rowIndex = rows.findIndex((r: any) => String(r[0]) === String(contentId));
  if (rowIndex === -1) return;

  const rowNum = rowIndex + 1;
  const rowData = rows[rowIndex];
  const colsToCheck = contentType === 'homework' ? [5, 6] : [6, 7, 8];
  
  for (const colIdx of colsToCheck) {
    let currentVal = String(rowData[colIdx] || "");
    if (!currentVal) continue;
    let parts = currentVal.split(',');
    let updated = false;
    let newParts = parts.map(part => {
      if (part.includes(fileId)) {
        updated = true;
        let subParts = part.split('#');
        return `${newUrl}#${subParts[1] || "file"}#${fileId}`;
      }
      return part;
    });
    if (updated) {
      const colLetter = String.fromCharCode(65 + colIdx);
      await updateSheetRow(env, `${sheetName}!${colLetter}${rowNum}`, [newParts.join(',')]);
    }
  }
}

// --- DAILY SUMMARY (Ported from google-apps-script.js) ---

const APP_BASE_URL = "https://pepsealsea.github.io/kanban";

function sortHomeworkByDeadline(a: any, b: any) {
  const tA = a.deadline ? getMidnightGMT7(new Date(a.deadline)).getTime() : Infinity;
  const tB = b.deadline ? getMidnightGMT7(new Date(b.deadline)).getTime() : Infinity;
  if (tA !== tB) return tA - tB;
  const subA = (a.subject || "").toString().toLowerCase();
  const subB = (b.subject || "").toString().toLowerCase();
  if (subA !== subB) return subA.localeCompare(subB, "th");
  return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
}

function summaryLineWithLink(label: string, url: string, suffix = "") {
  return `- ${label} <${url}>${suffix}\n`;
}

function summaryLinePlain(label: string, suffix = "") {
  return `- ${label}${suffix}\n`;
}

function homeworkHasDetailContent(hw: any): boolean {
  return !!(
    (hw.description && String(hw.description).trim()) ||
    (hw.link_image && String(hw.link_image).trim()) ||
    (hw.link_work && String(hw.link_work).trim())
  );
}

function homeworkSummaryLine(hw: any, suffix = "") {
  const label = `${hw.subject} : ${hw.title}`;
  if (homeworkHasDetailContent(hw)) {
    return summaryLineWithLink(label, `${APP_BASE_URL}/#/view?id=${hw.id}`, suffix);
  }
  return summaryLinePlain(label, suffix);
}

async function generateDailySummary(env: Bindings, targetDate?: string) {
  const [homework, learningContent] = await Promise.all([
    getHomeworkList(env),
    getLearningContent(env)
  ]);
  
  const now = targetDate ? new Date(targetDate) : new Date();
  const gmt7Now = getMidnightGMT7(now);
  const tomorrow = new Date(gmt7Now.getTime() + 86400000);
  const oneWeekLater = new Date(gmt7Now.getTime() + 7 * 86400000);

  const todayLC = learningContent.filter(item => {
    const itemDate = new Date(item.date);
    return getMidnightGMT7(itemDate).getTime() === gmt7Now.getTime();
  });

  const thaiDays = ["วันอาทิตย์", "วันจันทร์", "วันอังคาร", "วันพุธ", "วันพฤหัสบดี", "วันศุกร์", "วันเสาร์"];
  const dStr = String(gmt7Now.getDate()).padStart(2, '0');
  const mStr = String(gmt7Now.getMonth() + 1).padStart(2, '0');
  const yearBE = (gmt7Now.getFullYear() + 543).toString().slice(-2);
  
  let message = `# ${dStr}/${mStr}/${yearBE}\n`;

  if (todayLC.length > 0) {
    message += "\n## 📚 เนื้อหาวันนี้\n";
    todayLC.forEach(item => {
      const label = `${item.subject} : ${item.title}`;
      message += summaryLineWithLink(label, `${APP_BASE_URL}/content#/view?id=${item.id}`);
    });
    message += "\n> (AI สรุปเนื้อหา แต่มีรูปเนื้อหาและไฟล์เสียงในห้องนะ)\n";
  }

  const upcoming = homework.filter(hw => {
    if (!hw.deadline) return false;
    const d = new Date(hw.deadline);
    const m = getMidnightGMT7(d);
    return m >= tomorrow && m <= oneWeekLater;
  }).sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime());

  const grouped: Record<string, any[]> = {};
  upcoming.forEach(hw => {
    const d = new Date(hw.deadline!);
    const key = `## ${thaiDays[d.getDay()]} (${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')})`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(hw);
  });

  for (const key in grouped) {
    message += `\n${key}\n`;
    grouped[key].forEach(hw => {
      message += homeworkSummaryLine(hw, hw.note ? ` ${hw.note}` : "");
    });
  }

  const longTerm = homework.filter(hw => {
    if (!hw.deadline) return true;
    return getMidnightGMT7(new Date(hw.deadline)).getTime() > oneWeekLater.getTime();
  }).sort(sortHomeworkByDeadline);

  if (longTerm.length > 0) {
    message += "\n## งานดองเค็ม\n";
    longTerm.forEach(hw => {
      let dateSuffix = "";
      if (hw.deadline) {
        const d = new Date(hw.deadline);
        dateSuffix = ` (${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')})`;
      }
      message += homeworkSummaryLine(hw, dateSuffix);
    });
  }

  message += `\nเนื้อหาทั้งหมดอยู่ใน link นี้\n<${APP_BASE_URL}/>\n\n> Have question **Reply** to this Bot. || <@&1162383289575817326> ||`;
  return message;
}

// --- POST ACTIONS ---

async function addHomework(env: Bindings, data: any) {
  const id = Date.now().toString();
  const row = [id, data.subject || "", data.title || "", data.description || "", data.deadline || "", data.link_work || "", data.link_image || "", data.note || "", new Date().toISOString()];
  await appendSheetRow(env, `${SHEETS.HOMEWORK}!A:I`, row);
  return id;
}

async function editHomework(env: Bindings, data: any) {
  const rowIndex = await findRowIndexById(env, SHEETS.HOMEWORK, data.id);
  if (rowIndex === -1) throw new Error("Homework not found");
  const rowNum = rowIndex + 1;
  const row = [data.id, data.subject, data.title, data.description, data.deadline, data.link_work, data.link_image, data.note];
  await updateSheetRow(env, `${SHEETS.HOMEWORK}!A${rowNum}:H${rowNum}`, row);
  return "ok";
}

async function addLearningContent(env: Bindings, data: any) {
  const id = "LC-" + Date.now().toString();
  const row = [id, data.date || new Date().toISOString().split('T')[0], data.subject || "", data.title || "", data.description || "", data.audio_file_id || "", data.audio_url || "", data.attachments || "", data.links || "", new Date().toISOString()];
  await appendSheetRow(env, `${SHEETS.LEARNING_CONTENT}!A:J`, row);
  return id;
}

async function editLearningContent(env: Bindings, data: any) {
  const rowIndex = await findRowIndexById(env, SHEETS.LEARNING_CONTENT, data.id);
  if (rowIndex === -1) throw new Error("Content not found");
  const rowNum = rowIndex + 1;
  const row = [data.id, data.date, data.subject, data.title, data.description, data.audio_file_id, data.audio_url, data.attachments, data.links];
  await updateSheetRow(env, `${SHEETS.LEARNING_CONTENT}!A${rowNum}:I${rowNum}`, row);
  return "ok";
}

async function addUser(env: Bindings, email: string, displayName: string, photoUrl: string) {
  if (!email) return;
  const rows = await getSheetValues(env, `${SHEETS.USERS}!A:A`);
  const rowIndex = rows.findIndex((r: any) => String(r[0]).toLowerCase() === email.toLowerCase());
  if (rowIndex !== -1) {
    const sheetRow = rowIndex + 1;
    await updateSheetRow(env, `${SHEETS.USERS}!B${sheetRow}:C${sheetRow}`, [displayName || "", photoUrl || ""]);
  } else {
    await appendSheetRow(env, `${SHEETS.USERS}!A:D`, [email, displayName || "", photoUrl || "", new Date().toISOString()]);
  }
}

async function updateProgress(env: Bindings, email: string, homeworkId: string, status: string, imageUrl: string, append: boolean = false) {
  if (!email) throw new Error("Email is required");
  const rows = await getSheetValues(env, `${SHEETS.PROGRESS}!A:B`);
  const rowIndex = rows.findIndex((r: any) => String(r[0]).toLowerCase() === email.toLowerCase() && String(r[1]) === String(homeworkId));

  if (rowIndex === -1) {
    await appendSheetRow(env, `${SHEETS.PROGRESS}!A:E`, [email, homeworkId, status || "pending", imageUrl || "", new Date().toISOString()]);
  } else {
    const sheetRow = rowIndex + 1;
    if (status) await updateSheetRow(env, `${SHEETS.PROGRESS}!C${sheetRow}`, [status]);
    if (imageUrl !== undefined) {
      let finalUrl = imageUrl;
      if (append) {
        const currentVals = await getSheetValues(env, `${SHEETS.PROGRESS}!D${sheetRow}:D${sheetRow}`);
        const currentVal = currentVals[0]?.[0] || "";
        const currentUrls = currentVal ? currentVal.split(',') : [];
        if (imageUrl && !currentUrls.includes(imageUrl)) currentUrls.push(imageUrl);
        finalUrl = currentUrls.join(',');
      }
      await updateSheetRow(env, `${SHEETS.PROGRESS}!D${sheetRow}`, [finalUrl]);
    }
    await updateSheetRow(env, `${SHEETS.PROGRESS}!E${sheetRow}`, [new Date().toISOString()]);
  }

  if (imageUrl && imageUrl.trim().length > 0) {
    const [users, hws] = await Promise.all([getUserList(env), getHomeworkList(env)]);
    const user = users.find((u: any) => u.email === email) || { name: email };
    const hw = hws.find((h: any) => String(h.id) === String(homeworkId)) || { title: "Homework" };
    await sendSubmissionNotification(env, user.name, hw.title, status, imageUrl);
  }
}

async function deleteRowById(env: Bindings, sheetName: string, id: string) {
  const rows = await getSheetValues(env, `${sheetName}!A:A`);
  const rowIndex = rows.findIndex((r: any) => String(r[0]) === String(id));
  if (rowIndex === -1) return false;
  const token = await getAuthToken(env);
  const ssRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}`, { headers: { Authorization: `Bearer ${token}` } });
  const spreadsheet = await ssRes.json() as any;
  const sheet = spreadsheet.sheets.find((s: any) => s.properties.title === sheetName);
  if (!sheet) return false;
  const sheetId = sheet.properties.sheetId;
  await batchUpdateSheet(env, [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowIndex, endIndex: rowIndex + 1 } } }]);
  return true;
}

async function addComment(env: Bindings, homeworkId: string, ownerEmail: string, commenterEmail: string, text: string) {
  if (!homeworkId || !ownerEmail || !commenterEmail || !text) throw new Error("Missing parameters for comment");
  await appendSheetRow(env, `${SHEETS.COMMENTS}!A:E`, [homeworkId, ownerEmail, commenterEmail, text, new Date().toISOString()]);
  const [users, hws] = await Promise.all([getUserList(env), getHomeworkList(env)]);
  const commenter = users.find((u: any) => u.email === commenterEmail) || { name: commenterEmail };
  const owner = users.find((u: any) => u.email === ownerEmail) || { name: ownerEmail };
  const hw = hws.find((h: any) => String(h.id) === String(homeworkId)) || { title: "Homework" };
  const payload = { embeds: [{ title: "💬 New Comment in Activity Feed", color: 7506394, fields: [{ name: "From", value: commenter.name, inline: true }, { name: "To", value: owner.name + "'s work", inline: true }, { name: "Homework", value: hw.title, inline: false }, { name: "Comment", value: text }], footer: { text: "StudyFlow Activity Feed" }, timestamp: new Date().toISOString() }] };
  await sendSubmissionNotification(env, { ...payload, url: env.DISCORD_WEBHOOK_URL } as any, env.DISCORD_WEBHOOK_URL); // Modified to work with generic helper
  return true;
}

async function addSubject(env: Bindings, name: string, color: string) {
  if (!name) throw new Error("Name is required");
  const id = Date.now().toString() + Math.floor(Math.random() * 1000);
  await appendSheetRow(env, `${SHEETS.SUBJECTS}!A:D`, [id, name, color || "#6366f1", new Date().toISOString()]);
  return id;
}

async function getComments(env: Bindings, homeworkId?: string, ownerEmail?: string) {
  const rows = await getSheetValues(env, `${SHEETS.COMMENTS}!A2:E`);
  const comments = toObjects(rows, ["homework_id", "owner_email", "commenter_email", "text", "created_at"]);
  let filtered = comments;
  if (homeworkId) filtered = filtered.filter((r: any) => String(r.homework_id) === String(homeworkId));
  if (ownerEmail) filtered = filtered.filter((r: any) => String(r.owner_email).toLowerCase() === ownerEmail.toLowerCase());
  const users = await getUserList(env);
  return filtered.map((r: any) => {
    const u = users.find((user: any) => String(user.email).toLowerCase() === String(r.commenter_email).toLowerCase());
    return { ...r, commenter_name: u ? u.name : r.commenter_email, commenter_picture: u ? u.picture : "" };
  });
}

async function fixSheetHeaders(env: Bindings) {
  const results = [];
  for (const [sheetName, headers] of Object.entries(EXPECTED_HEADERS)) {
    const endCol = String.fromCharCode(64 + headers.length);
    const range = `${sheetName}!A1:${endCol}1`;
    try {
      await updateSheetRow(env, range, headers);
      results.push(`${sheetName}: Headers fixed`);
    } catch (e: any) {
      if (e.message.includes('Bad Request')) {
        try {
          await batchUpdateSheet(env, [
            { addSheet: { properties: { title: sheetName } } }
          ]);
          await updateSheetRow(env, range, headers);
          results.push(`${sheetName}: Sheet created and headers fixed`);
        } catch (err: any) {
          results.push(`${sheetName}: Failed to create - ${err.message}`);
        }
      } else {
        results.push(`${sheetName}: Failed - ${e.message}`);
      }
    }
  }
  return results;
}

async function logAnalytics(env: Bindings, data: any, req: any) {
  if (isAdminEmail(data.email)) {
    return { skipped: true, reason: "admin" };
  }

  const id = Date.now().toString() + Math.floor(Math.random() * 1000);
  const ipAddress = req.header('cf-connecting-ip') || req.header('x-forwarded-for') || "unknown";
  
  const row = [
    id, 
    data.event_type || "visit", 
    data.device_name || "unknown", 
    data.browser || "unknown", 
    ipAddress, 
    data.email || "", 
    new Date().toISOString(),
    data.page_visited || "",
    data.content_id || "",
    data.fingerprint || "",
    data.session_id || "",
    typeof data.metadata === 'string' ? data.metadata : (data.metadata ? JSON.stringify(data.metadata) : "")
  ];
  const endCol = String.fromCharCode(64 + ANALYTICS_COLUMNS.length);
  await appendSheetRow(env, `${SHEETS.ANALYTICS}!A:${endCol}`, row);
  return id;
}

// --- NOTIFICATIONS ---

async function sendSubmissionNotification(env: Bindings, studentName: string | any, homeworkTitle?: string, status?: string, content?: string) {
  const url = env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  
  let payload: any;
  if (typeof studentName === 'object') {
    payload = studentName;
  } else {
    const isFile = content?.includes("http");
    const label = isFile ? "📎 New Attachment" : "📣 New Progress Update";
    const color = isFile ? 3447003 : 15105570;
    let displayContent = content || "";
    if (isFile) {
      displayContent = displayContent.split(',').map(p => {
        const [u, h] = p.trim().split('#');
        return h ? `[${decodeURIComponent(h)}](${u})` : `[View File](${u})`;
      }).join('\n');
    }
    payload = { embeds: [{ title: label, color: color, fields: [{ name: "Student", value: studentName, inline: true }, { name: "Homework", value: homeworkTitle, inline: true }, { name: "Content", value: displayContent.substring(0, 1000) }], footer: { text: "StudyFlow Activity Feed" }, timestamp: new Date().toISOString() }] };
  }

  await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}

// --- ROUTES ---

app.get('/health', (c) => c.text('ok'));

app.get('/', async (c) => {
  const action = c.req.query('action');
  const email = c.req.query('email') || "";
  try {
    if (!action) return c.json({ success: true, message: "StudyFlow Cloudflare Worker is online 🚀" });
    let result: any;
    switch (action) {
      case "list": result = await getHomeworkList(c.env); break;
      case "listWithProgress": result = await getHomeworkWithProgress(c.env, email); break;
      case "progress": result = await getProgressByEmail(c.env, email); break;
      case "allProgress": result = await getAllProgress(c.env); break;
      case "users": result = await getUserList(c.env); break;
      case "comments": result = await getComments(c.env, c.req.query('homework_id'), c.req.query('owner_email')); break;
      case "learningContent": result = await getLearningContent(c.env, c.req.query('date'), c.req.query('id')); break;
      case "subjects": result = await getSubjects(c.env); break;
      case "dailySummary": 
        const summary = await generateDailySummary(c.env, c.req.query('date'));
        if (c.req.query('send') === 'true') {
          await fetch(c.env.SUMMARY_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: summary }) });
        }
        result = { summary };
        break;
      case "getFreshLink":
        const fileId = c.req.query('fileId');
        if (!fileId) throw new Error("fileId is required");
        result = await getFreshTelegramLink(c.env, fileId, c.req.query('contentId'), c.req.query('contentType'));
        break;
      case "batchData": 
        result = { 
          homework: await getHomeworkList(c.env), 
          users: await getUserList(c.env), 
          progress: await getAllProgress(c.env), 
          learningContent: await getLearningContent(c.env), 
          subjects: await getSubjects(c.env),
          analytics: await getAnalytics(c.env),
          audioPermissions: await getAudioPermissions(c.env),
        };
        break;
      default: return c.json({ success: false, error: "unknown action: " + action }, 400);
    }
    return c.json({ success: true, ...result, data: result });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.post('/', async (c) => {
  try {
    let body: any = {};
    const contentType = c.req.header('content-type') || '';
    if (contentType.includes('application/json')) body = await c.req.json();
    else body = await c.req.parseBody();

    const action = body.action || c.req.query('action');
    const getVal = (key: string) => body[key] || c.req.query(key);
    if (!action) return c.json({ success: false, error: "Missing action" }, 400);

    let result: any;
    switch (action) {
      case "logAnalytics": result = await logAnalytics(c.env, body, c.req); break;
      case "addHomework": result = await addHomework(c.env, body); break;
      case "editHomework": result = await editHomework(c.env, body); break;
      case "deleteHomework": result = await deleteRowById(c.env, SHEETS.HOMEWORK, getVal('id')); break;
      case "addLearningContent": result = await addLearningContent(c.env, body); break;
      case "editLearningContent": result = await editLearningContent(c.env, body); break;
      case "deleteLearningContent": result = await deleteRowById(c.env, SHEETS.LEARNING_CONTENT, getVal('id')); break;
      case "updateProgress": await updateProgress(c.env, getVal('email'), getVal('homework_id'), getVal('status'), getVal('image_url'), getVal('append') === 'true'); result = "ok"; break;
      case "addUser": await addUser(c.env, getVal('email'), getVal('display_name'), getVal('photo_url')); result = "ok"; break;
      case "addSubject": result = await addSubject(c.env, getVal('name'), getVal('color')); break;
      case "deleteSubject": result = await deleteRowById(c.env, SHEETS.SUBJECTS, getVal('id')); break;
      case "addComment": result = await addComment(c.env, getVal('homework_id'), getVal('owner_email'), getVal('commenter_email'), getVal('text')); break;
      case "sendSummary":
        const summaryText = await generateDailySummary(c.env, getVal('date'));
        await fetch(c.env.SUMMARY_WEBHOOK_URL, { 
          method: "POST", 
          headers: { "Content-Type": "application/json" }, 
          body: JSON.stringify({ content: summaryText }) 
        });
        result = "Summary sent to Discord successfully! 📢";
        break;
      case "registerUpload":
        const uploadRow = [Date.now().toString(), getVal('filename'), getVal('contentType'), getVal('url'), new Date().toISOString(), "", getVal('fileId')];
        await appendSheetRow(c.env, `${SHEETS.URLS}!A:G`, uploadRow);
        result = "ok";
        break;
      case "upload":
      case "uploadProof":
      case "uploadAudio":
        const file = body.myFile || body.content || body.contents;
        let blob: Blob;
        let filename = getVal('filename') || "uploaded_file";
        let mimeType = getVal('contentType') || "application/octet-stream";
        
        if (file instanceof File) {
          blob = file;
          filename = file.name;
          mimeType = file.type;
        } else if (typeof file === 'string') {
          const base64 = file.includes('base64,') ? file.split('base64,')[1] : file;
          const bin = atob(base64);
          const uint8 = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) uint8[i] = bin.charCodeAt(i);
          blob = new Blob([uint8], { type: mimeType });
        } else {
          throw new Error("No file content provided");
        }
        
        const uploadRes = await uploadToTelegram(c.env, blob, filename, mimeType);
        const finalUrl = `${uploadRes.url}#${encodeURIComponent(filename)}#${uploadRes.fileId}`;
        
        if (action === 'uploadProof') {
          await updateProgress(c.env, getVal('email'), getVal('homework_id'), getVal('status'), finalUrl, true);
        }
        result = { ...uploadRes, url: finalUrl };
        break;
      case "fixSheetHeaders":
        result = await fixSheetHeaders(c.env);
        break;
      default: return c.json({ success: false, error: "unknown action: " + action }, 400);
    }
    return c.json({ success: true, data: result });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

export default app;
