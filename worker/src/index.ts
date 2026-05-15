import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { JWT } from 'google-auth-library';

type Bindings = {
  SPREADSHEET_ID: string;
  DISCORD_WEBHOOK_URL: string;
  SUMMARY_WEBHOOK_URL: string;
  GOOGLE_CLIENT_EMAIL: string;
  GOOGLE_PRIVATE_KEY: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', cors());

const SHEETS = {
  HOMEWORK: "Homework",
  USERS: "Users",
  PROGRESS: "Progress",
  URLS: "URLs",
  COMMENTS: "Comments",
  LEARNING_CONTENT: "LearningContent",
  SUBJECTS: "Subjects",
};

// Helper to get Google Sheets Auth Token
async function getAuthToken(env: Bindings) {
  const client = new JWT({
    email: env.GOOGLE_CLIENT_EMAIL,
    key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const credentials = await client.authorize();
  return credentials.access_token;
}

// Google Sheets API Helpers
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

// Logic Functions Ported from GAS
function toObjects(rows: any[][], headers: string[]) {
  if (!rows || rows.length === 0) return [];
  return rows.map(row => {
    const obj: any = {};
    headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : ""; });
    return obj;
  });
}

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

async function getComments(env: Bindings, homeworkId?: string, ownerEmail?: string) {
  const rows = await getSheetValues(env, `${SHEETS.COMMENTS}!A2:E`);
  const comments = toObjects(rows, ["homework_id", "owner_email", "commenter_email", "text", "created_at"]);
  
  let filtered = comments;
  if (homeworkId) filtered = filtered.filter((r: any) => String(r.homework_id) === String(homeworkId));
  if (ownerEmail) filtered = filtered.filter((r: any) => String(r.owner_email).toLowerCase() === ownerEmail.toLowerCase());

  const users = await getUserList(env);
  return filtered.map((r: any) => {
    const u = users.find((user: any) => String(user.email).toLowerCase() === String(r.commenter_email).toLowerCase());
    return {
      ...r,
      commenter_name: u ? u.name : r.commenter_email,
      commenter_picture: u ? u.picture : "",
    };
  });
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

// POST Actions
async function addHomework(env: Bindings, data: any) {
  const id = Date.now().toString();
  const row = [id, data.subject || "", data.title || "", data.description || "", data.deadline || "", data.link_work || "", data.link_image || "", data.note || "", new Date().toISOString()];
  await appendSheetRow(env, `${SHEETS.HOMEWORK}!A:I`, row);
  return id;
}

async function addUser(env: Bindings, email: string, displayName: string, photoUrl: string) {
  if (!email) return;
  const rows = await getSheetValues(env, `${SHEETS.USERS}!A:A`);
  const rowIndex = rows.findIndex((r: any) => String(r[0]).toLowerCase() === email.toLowerCase());
  
  if (rowIndex !== -1) {
    const sheetRow = rowIndex + 1; // 1-indexed
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
        if (imageUrl && !currentUrls.includes(imageUrl)) {
          currentUrls.push(imageUrl);
        }
        finalUrl = currentUrls.join(',');
      }
      await updateSheetRow(env, `${SHEETS.PROGRESS}!D${sheetRow}`, [finalUrl]);
    }
    await updateSheetRow(env, `${SHEETS.PROGRESS}!E${sheetRow}`, [new Date().toISOString()]);
  }

  if (imageUrl && imageUrl.trim().length > 0) {
    // Send Discord Notification
    const [users, hws] = await Promise.all([getUserList(env), getHomeworkList(env)]);
    const user = users.find((u: any) => u.email === email) || { name: email };
    const hw = hws.find((h: any) => String(h.id) === String(homeworkId)) || { title: "Homework" };
    await sendSubmissionNotification(env, user.name, hw.title, status, imageUrl);
  }
}

// Discord Notification Helpers
async function sendDiscordNotification(env: Bindings, payload: any, url: string) {
  if (!url) return;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function sendSubmissionNotification(env: Bindings, studentName: string, homeworkTitle: string, status: string, content: string) {
  const isFile = content.includes("http");
  const label = isFile ? "📎 New Attachment" : "📣 New Progress Update";
  const color = isFile ? 3447003 : 15105570;

  let displayContent = content;
  if (isFile) {
    const parts = content.split(',');
    displayContent = parts.map(p => {
      const [url, hash] = p.trim().split('#');
      return hash ? `[${decodeURIComponent(hash)}](${url})` : `[View File](${url})`;
    }).join('\n');
  }

  const payload = {
    embeds: [{
      title: label,
      color: color,
      fields: [
        { name: "Student", value: studentName, inline: true },
        { name: "Homework", value: homeworkTitle, inline: true },
        { name: "Content", value: displayContent.substring(0, 1000) }
      ],
      footer: { text: "StudyFlow Activity Feed" },
      timestamp: new Date().toISOString()
    }]
  };

  await sendDiscordNotification(env, payload, env.DISCORD_WEBHOOK_URL);
}

async function deleteRowById(env: Bindings, sheetName: string, id: string) {
  const rows = await getSheetValues(env, `${sheetName}!A:A`);
  const rowIndex = rows.findIndex((r: any) => String(r[0]) === String(id));
  if (rowIndex === -1) return false;

  const token = await getAuthToken(env);
  const spreadsheet = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}`, {
    headers: { Authorization: `Bearer ${token}` }
  })).json() as any;
  const sheet = spreadsheet.sheets.find((s: any) => s.properties.title === sheetName);
  if (!sheet) return false;
  const sheetId = sheet.properties.sheetId;

  await batchUpdateSheet(env, [{
    deleteDimension: {
      range: {
        sheetId,
        dimension: "ROWS",
        startIndex: rowIndex,
        endIndex: rowIndex + 1
      }
    }
  }]);
  return true;
}

async function addComment(env: Bindings, homeworkId: string, ownerEmail: string, commenterEmail: string, text: string) {
  if (!homeworkId || !ownerEmail || !commenterEmail || !text) throw new Error("Missing parameters for comment");
  await appendSheetRow(env, `${SHEETS.COMMENTS}!A:E`, [homeworkId, ownerEmail, commenterEmail, text, new Date().toISOString()]);

  const [users, hws] = await Promise.all([getUserList(env), getHomeworkList(env)]);
  const commenter = users.find((u: any) => u.email === commenterEmail) || { name: commenterEmail };
  const owner = users.find((u: any) => u.email === ownerEmail) || { name: ownerEmail };
  const hw = hws.find((h: any) => String(h.id) === String(homeworkId)) || { title: "Homework" };

  const payload = {
    embeds: [{
      title: "💬 New Comment in Activity Feed",
      color: 7506394,
      fields: [
        { name: "From", value: commenter.name, inline: true },
        { name: "To", value: owner.name + "'s work", inline: true },
        { name: "Homework", value: hw.title, inline: false },
        { name: "Comment", value: text }
      ],
      footer: { text: "StudyFlow Activity Feed" },
      timestamp: new Date().toISOString()
    }]
  };

  await sendDiscordNotification(env, payload, env.DISCORD_WEBHOOK_URL);
  return true;
}

// Routes
app.get('/health', (c) => c.text('ok'));

app.get('/', async (c) => {
  const action = c.req.query('action');
  const email = c.req.query('email') || "";
  
  try {
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
      case "batchData": result = {
          homework: await getHomeworkList(c.env),
          users: await getUserList(c.env),
          progress: await getAllProgress(c.env),
          learningContent: await getLearningContent(c.env),
          subjects: await getSubjects(c.env)
        }; 
        break;
      default: return c.json({ success: false, error: "unknown action: " + action }, 400);
    }
    return c.json({ success: true, data: result });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.post('/', async (c) => {
  try {
    let body: any;
    const contentType = c.req.header('content-type');
    if (contentType?.includes('application/json')) {
      body = await c.req.json();
    } else {
      body = await c.req.parseBody();
    }
    const action = body.action || c.req.query('action');
    const getVal = (key: string) => body[key] || c.req.query(key);
    
    let result: any;
    switch (action) {
      case "addHomework":
        result = await addHomework(c.env, body);
        break;
      case "addUser":
        await addUser(c.env, getVal('email'), getVal('display_name'), getVal('photo_url'));
        result = "ok";
        break;
      case "updateProgress":
        await updateProgress(c.env, getVal('email'), getVal('homework_id'), getVal('status'), getVal('image_url'), getVal('append') === 'true');
        result = "ok";
        break;
      case "deleteHomework":
        result = await deleteRowById(c.env, SHEETS.HOMEWORK, getVal('id'));
        break;
      case "addComment":
        result = await addComment(c.env, getVal('homework_id'), getVal('owner_email'), getVal('commenter_email'), getVal('text'));
        break;
      default:
        return c.json({ success: false, error: "unknown action: " + action }, 400);
    }
    return c.json({ success: true, data: result });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

export default app;
