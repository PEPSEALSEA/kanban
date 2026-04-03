/**
 * ⚠️ CONFIGURATION: Put your Google Spreadsheet ID here (NOT the Web App URL!)
 * The ID is the long string in the Sheet URL like: 
 * https://docs.google.com/spreadsheets/d/1XyZ.../edit
 */
const SPREADSHEET_ID = "1KKYw0kjsRyzs-cfxFrzHh5ZYtu35eRad2x6IXhE_fE4";

const SHEETS = {
    HOMEWORK: "Homework",
    USERS: "Users",
    PROGRESS: "Progress",
    URLS: "URLs",
    COMMENTS: "Comments",
    LEARNING_CONTENT: "LearningContent",
};

const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1478774323874500640/3jwe9TnrxPJNCOJkPFln6OP1Ts1zxYhDaMC1FnIt5CzBhJwFDn-ogkMw-XYWtYr5eNVl"; // USER: Please fill your Discord Webhook URL here
const SUMMARY_WEBHOOK_URL = "https://discord.com/api/webhooks/1478970697471754277/iXaANL47rTjQHUlTd-oa-Tvr4VDV22kWZ73LViN8l6brQKpOOs-zkahf8PsEmoS1O_YS";

function doGet(e) {
    const params = e.parameter || {};
    const action = params.action;
    const email = params.email || "";

    try {
        let result;
        if (action === "list") result = getHomeworkList();
        else if (action === "listWithProgress") result = getHomeworkWithProgress(email);
        else if (action === "progress") result = getProgressByEmail(email);
        else if (action === "allProgress") result = getAllProgress();
        else if (action === "users") result = getUserList();
        else if (action === "comments") result = getComments(params.homework_id, params.owner_email);
        else if (action === "learningContent") result = getLearningContent(params.date, params.id);
        else if (action === "setup") { setupSheet(); result = "setup complete"; }
        else throw new Error("unknown action: " + action);

        return _json({ success: true, data: result });
    } catch (err) {
        return _json({ success: false, error: err.message });
    }
}

function doOptions() {
    return ContentService.createTextOutput("")
        .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
    try {
        const params = e.parameter || {};
        let postData = {};
        if (e.postData && e.postData.contents) {
            try {
                postData = JSON.parse(e.postData.contents);
            } catch (ex) {
                // Not JSON
            }
        }

        const getVal = (key) => {
            if (params[key] !== undefined) return params[key];
            if (postData[key] !== undefined) return postData[key];
            if (key === 'homework_id') return getVal('homeworkId') || getVal('id');
            return undefined;
        };

        const action = getVal('action');
        let result;

        if (action === "addHomework") {
            result = addHomework(
                getVal('subject'), getVal('title'), getVal('description'),
                getVal('deadline'), getVal('link_work'), getVal('link_image'), getVal('note')
            );
        } else if (action === "addUser") {
            addUser(getVal('email'), getVal('display_name'), getVal('photo_url'));
            result = "ok";
        } else if (action === "updateProgress") {
            updateProgress(
                getVal('email'), getVal('homework_id'), getVal('status'),
                getVal('image_url'), getVal('append') === 'true'
            );
            result = "ok";
        } else if (action === "deleteHomework") {
            const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
            const hw = getHomeworkList().find(h => String(h.id) === String(getVal('id')));
            if (hw) {
                // Collect Drive IDs to clean up URLs sheet
                const allUrls = (hw.link_image || "").split(',').concat(
                    getAllProgress()
                        .filter(p => String(p.homework_id) === String(getVal('id')))
                        .map(p => p.image_url || "")
                ).join(',').split(',').filter(Boolean);

                const driveIds = allUrls.map(url => _extractDriveId(url)).filter(Boolean);
                if (driveIds.length > 0) _removeUrlsByDriveIds(driveIds);
            }
            result = deleteHomework(getVal('id'));
        } else if (action === "deleteUrl") {
            _removeUrlsByDriveIds([getVal('driveId')]);
            result = "ok";
        } else if (action === "editHomework") {
            result = editHomework(
                getVal('id'), getVal('subject'), getVal('title'), getVal('description'),
                getVal('deadline'), getVal('link_work'), getVal('link_image'), getVal('note')
            );
        } else if (action === "addComment") {
            result = addComment(
                getVal('homework_id'), getVal('owner_email'), getVal('commenter_email'), getVal('text')
            );
        } else if (action === "addLearningContent") {
            result = addLearningContent(
                getVal('date'), getVal('subject'), getVal('title'), getVal('description'),
                getVal('audio_file_id'), getVal('audio_url'), getVal('attachments'), getVal('links')
            );
        } else if (action === "editLearningContent") {
            result = editLearningContent(
                getVal('id'), getVal('date'), getVal('subject'), getVal('title'), getVal('description'),
                getVal('audio_file_id'), getVal('audio_url'), getVal('attachments'), getVal('links')
            );
        } else if (action === "deleteLearningContent") {
            result = deleteLearningContent(getVal('id'));
        } else {
            throw new Error("unknown action: " + action);
        }

        return _json({ success: true, data: result });
    } catch (err) {
        return _json({ success: false, error: err.message });
    }
}

function _json(obj) {
    const output = ContentService.createTextOutput(JSON.stringify(obj));
    output.setMimeType(ContentService.MimeType.JSON);
    return output;
}

function setupSheet() {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    _setupHomework(ss);
    _setupUsers(ss);
    _setupProgress(ss);
    _setupUrls(ss);
    _setupComments(ss);
    _setupLearningContent(ss);
}

function _setupLearningContent(ss) {
    let sheet = ss.getSheetByName(SHEETS.LEARNING_CONTENT) || ss.insertSheet(SHEETS.LEARNING_CONTENT);
    if (sheet.getLastRow() === 0) {
        sheet.appendRow(["id", "date", "subject", "title", "description", "audio_file_id", "audio_url", "attachments", "links", "created_at"]);
        sheet.setFrozenRows(1);
    }
}

function _setupHomework(ss) {
    let sheet = ss.getSheetByName(SHEETS.HOMEWORK) || ss.insertSheet(SHEETS.HOMEWORK);
    sheet.clearContents();
    sheet.getRange(1, 1, 1, 9).setValues([["id", "subject", "title", "description", "deadline", "link_work", "link_image", "note", "created_at"]]);
    sheet.setFrozenRows(1);
}

function _setupUsers(ss) {
    let sheet = ss.getSheetByName(SHEETS.USERS) || ss.insertSheet(SHEETS.USERS);
    sheet.clearContents();
    sheet.getRange(1, 1, 1, 4).setValues([["email", "display_name", "photo_url", "created_at"]]);
    sheet.setFrozenRows(1);
}

function _setupProgress(ss) {
    let sheet = ss.getSheetByName(SHEETS.PROGRESS) || ss.insertSheet(SHEETS.PROGRESS);
    sheet.clearContents();
    sheet.getRange(1, 1, 1, 5).setValues([["email", "homework_id", "status", "image_url", "updated_at"]]);
    sheet.setFrozenRows(1);
    sheet.getRange("C2:C5000").setDataValidation(
        SpreadsheetApp.newDataValidation().requireValueInList(["pending", "in_progress", "done"]).build()
    );
}

function _setupUrls(ss) {
    let sheet = ss.getSheetByName(SHEETS.URLS) || ss.insertSheet(SHEETS.URLS);
    sheet.clearContents();
    sheet.getRange(1, 1, 1, 7).setValues([["ID", "Name", "Type", "URL", "Created At", "Expiry Date", "Drive ID"]]);
    sheet.setFrozenRows(1);
}

function addHomework(subject, title, description, deadline, linkWork, linkImage, note) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEETS.HOMEWORK) || ss.insertSheet(SHEETS.HOMEWORK);

    // Ensure header if sheet is clean
    if (sheet.getLastRow() === 0) {
        sheet.appendRow(["id", "subject", "title", "description", "deadline", "link_work", "link_image", "note", "created_at"]);
    }

    // Use timestamp as ID for uniqueness across deletions
    const id = Date.now().toString();
    sheet.appendRow([id, subject || "", title || "", description || "", deadline || "", linkWork || "", linkImage || "", note || "", new Date()]);
    return id;
}

function addUser(email, displayName, photoUrl) {
    if (!email) return;
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(SHEETS.USERS) || ss.insertSheet(SHEETS.USERS);
    if (sheet.getLastRow() === 0) {
        sheet.appendRow(["email", "display_name", "photo_url", "created_at"]);
    }
    const existingRow = _getUserRow(sheet, email);
    if (existingRow) {
        // Update name and photo if they changed
        sheet.getRange(existingRow, 2, 1, 2).setValues([[displayName || "", photoUrl || ""]]);
    } else {
        sheet.appendRow([email, displayName || "", photoUrl || "", new Date()]);
    }
}

function updateProgress(email, homeworkId, status, imageUrl, append = false) {
    if (!email) throw new Error("Email is required");
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(SHEETS.PROGRESS) || ss.insertSheet(SHEETS.PROGRESS);
    if (sheet.getLastRow() === 0) {
        sheet.appendRow(["email", "homework_id", "status", "image_url", "updated_at"]);
    }

    if (!_isUserAllowed(ss, email)) throw new Error("email not allowed: " + email);

    const data = sheet.getLastRow() > 1
        ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues()
        : [];
    const rowIndex = data.findIndex(r => String(r[0]).toLowerCase() === String(email).toLowerCase() && String(r[1]) === String(homeworkId));

    if (rowIndex === -1) {
        sheet.appendRow([email, homeworkId, status || "pending", imageUrl || "", new Date()]);
    } else {
        const targetRow = rowIndex + 2;
        if (status !== undefined) sheet.getRange(targetRow, 3).setValue(status);

        if (imageUrl !== undefined) {
            let finalUrl = imageUrl;
            if (append) {
                const currentVal = String(sheet.getRange(targetRow, 4).getValue() || "");
                const currentUrls = currentVal ? currentVal.split(',') : [];
                if (imageUrl && !currentUrls.includes(imageUrl)) {
                    currentUrls.push(imageUrl);
                }
                finalUrl = currentUrls.join(',');
            }
            sheet.getRange(targetRow, 4).setValue(finalUrl || "");
        }
        sheet.getRange(targetRow, 5).setValue(new Date());
    }

    // New: Send notification IF there is an attachment or comment content
    // We skip if it's just a status check (empty image_url or just a space)
    if (imageUrl && imageUrl.trim().length > 0) {
        const users = getUserList();
        const user = users.find(u => u.email === email) || { name: email };
        const hws = getHomeworkList();
        const hw = hws.find(h => String(h.id) === String(homeworkId)) || { title: "Homework" };
        sendSubmissionNotification(user.name, hw.title, status, imageUrl);
    }
}

function getHomeworkList() {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEETS.HOMEWORK);
    if (sheet.getLastRow() < 2) return [];
    return _toObjects(
        sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues(),
        ["id", "subject", "title", "description", "deadline", "link_work", "link_image", "note", "created_at"]
    );
}

function getUserList() {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEETS.USERS);
    if (!sheet || sheet.getLastRow() < 2) return [];
    return _toObjects(
        sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues(),
        ["email", "name", "picture", "created_at"]
    );
}

function getProgressByEmail(email) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEETS.PROGRESS);
    if (sheet.getLastRow() < 2) return [];
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
    if (email) {
        return data.filter(r => r[0] === email)
            .map(r => ({ email: r[0], homework_id: r[1], status: r[2], image_url: r[3], updated_at: r[4] }));
    }

    return data.map(r => ({ email: r[0], homework_id: r[1], status: r[2], image_url: r[3], updated_at: r[4] }));
}

function getAllProgress() {
    return getProgressByEmail();
}

function getHomeworkWithProgress(email) {
    const progressMap = {};
    getProgressByEmail(email).forEach(p => { progressMap[p.homework_id] = p.status; });
    return getHomeworkList().map(hw => ({ ...hw, my_status: progressMap[hw.id] || "pending" }));
}

function _isUserAllowed(ss, email) {
    return !!_getUserRow(ss.getSheetByName(SHEETS.USERS), email);
}

function _extractDriveId(url) {
    if (!url) return null;
    const match = url.match(/[-\w]{25,}/);
    return match ? match[0] : null;
}

function _removeUrlsByDriveIds(driveIds) {
    if (!driveIds || driveIds.length === 0) return;
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEETS.URLS);
    if (!sheet || sheet.getLastRow() < 2) return;

    const data = sheet.getRange(2, 7, sheet.getLastRow() - 1, 1).getValues();
    const idsToMatch = driveIds.map(id => String(id));

    for (let i = data.length - 1; i >= 0; i--) {
        if (idsToMatch.includes(String(data[i][0]))) {
            sheet.deleteRow(i + 2);
        }
    }
}

function _getUserRow(sheet, email) {
    if (!sheet || sheet.getLastRow() < 2) return null;
    const emailToFind = String(email).toLowerCase();
    const idx = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().findIndex(r => String(r[0]).toLowerCase() === emailToFind);
    return idx === -1 ? null : idx + 2;
}

function _toObjects(rows, headers) {
    return rows.filter(r => r[0] !== "").map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i]; });
        return obj;
    });
}

function deleteHomework(id) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEETS.HOMEWORK);
    if (!sheet) return false;
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(id)) {
            sheet.deleteRow(i + 1);
            return true;
        }
    }
    return false;
}

function editHomework(id, subject, title, description, deadline, linkWork, linkImage, note) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEETS.HOMEWORK);
    if (!sheet) return false;
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(id)) {
            const row = i + 1;
            if (subject !== undefined) sheet.getRange(row, 2).setValue(subject);
            if (title !== undefined) sheet.getRange(row, 3).setValue(title);
            if (description !== undefined) sheet.getRange(row, 4).setValue(description);
            if (deadline !== undefined) sheet.getRange(row, 5).setValue(deadline);
            if (linkWork !== undefined) sheet.getRange(row, 6).setValue(linkWork);
            if (linkImage !== undefined) sheet.getRange(row, 7).setValue(linkImage);
            if (note !== undefined) sheet.getRange(row, 8).setValue(note);
            return true;
        }
    }
    return false;
}

function _setupComments(ss) {
    let sheet = ss.getSheetByName(SHEETS.COMMENTS) || ss.insertSheet(SHEETS.COMMENTS);
    if (sheet.getLastRow() === 0) {
        sheet.appendRow(["homework_id", "owner_email", "commenter_email", "comment_text", "created_at"]);
        sheet.setFrozenRows(1);
    }
}

function addComment(homeworkId, ownerEmail, commenterEmail, text) {
    if (!homeworkId || !ownerEmail || !commenterEmail || !text) throw new Error("Missing parameters for comment");
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEETS.COMMENTS);
    sheet.appendRow([homeworkId, ownerEmail, commenterEmail, text, new Date()]);

    const users = getUserList();
    const commenter = users.find(u => u.email === commenterEmail) || { name: commenterEmail };
    const owner = users.find(u => u.email === ownerEmail) || { name: ownerEmail };
    const hwList = getHomeworkList();
    const hw = hwList.find(h => String(h.id) === String(homeworkId)) || { title: "Homework" };

    sendDiscordNotification(commenter.name, owner.name, hw.title, text);
    return true;
}

function getComments(homeworkId, ownerEmail) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEETS.COMMENTS);
    if (!sheet || sheet.getLastRow() < 2) return [];
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();

    let filtered = data;
    if (homeworkId) filtered = filtered.filter(r => String(r[0]) === String(homeworkId));
    if (ownerEmail) filtered = filtered.filter(r => String(r[1]).toLowerCase() === String(ownerEmail).toLowerCase());

    const users = getUserList();
    return filtered.map(r => {
        const u = users.find(user => String(user.email).toLowerCase() === String(r[2]).toLowerCase());
        return {
            commenter_email: r[2],
            commenter_name: u ? u.name : r[2],
            commenter_picture: u ? u.picture : "",
            text: r[3],
            created_at: r[4]
        };
    });
}

function sendDiscordNotification(commenter, owner, homeworkTitle, text) {
    if (!DISCORD_WEBHOOK_URL) return;
    const payload = {
        embeds: [{
            title: "💬 New Comment in Activity Feed",
            color: 7506394, // Discord Blurple
            fields: [
                { name: "From", value: commenter, inline: true },
                { name: "To", value: owner + "'s work", inline: true },
                { name: "Homework", value: homeworkTitle, inline: false },
                { name: "Comment", value: text }
            ],
            footer: { text: "StudyFlow Activity Feed" },
            timestamp: new Date().toISOString()
        }]
    };

    UrlFetchApp.fetch(DISCORD_WEBHOOK_URL, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    });
}

function sendSubmissionNotification(studentName, homeworkTitle, status, content) {
    if (!DISCORD_WEBHOOK_URL) return;

    const isFile = content.includes("http");
    const label = isFile ? "📎 New Attachment" : "📣 New Progress Update";
    const color = isFile ? 3447003 : 15105570; // Blue for files, Orange for updates

    // Create a clean preview of content (files or text)
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

    UrlFetchApp.fetch(DISCORD_WEBHOOK_URL, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    });
}

/**
 * Sends a daily summary of homework to Discord.
 * This can be triggered manually or via a Time-driven trigger.
 */
function sendDailySummaryToDiscord() {
    if (!SUMMARY_WEBHOOK_URL) return;

    const summaryText = generateDailySummary();

    const payload = {
        content: summaryText
    };

    UrlFetchApp.fetch(SUMMARY_WEBHOOK_URL, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    });
}

function generateDailySummary() {
    const homework = getHomeworkList();
    const now = new Date();

    // Format Header Date: DD/MM/YY (Buddhist Era)
    const dStr = String(now.getDate()).padStart(2, '0');
    const mStr = String(now.getMonth() + 1).padStart(2, '0');
    const yearBE = (now.getFullYear() + 543).toString().slice(-2);
    const headerDate = `# ${dStr}/${mStr}/${yearBE}`;

    // Thai Day Names
    const thaiDays = ["วันอาทิตย์", "วันจันทร์", "วันอังคาร", "วันพุธ", "วันพฤหัสบดี", "วันศุกร์", "วันเสาร์"];

    // Categorize homework
    const groupings = {}; // groupings[dateStr] = []
    const longTerm = [];

    const sortedHw = homework.sort((a, b) => {
        const dateA = new Date(a.deadline);
        const dateB = new Date(b.deadline);
        return dateA - dateB;
    });

    const oneWeekInMs = 7 * 24 * 60 * 60 * 1000;
    const threshold = new Date(now.getTime() + oneWeekInMs);

    sortedHw.forEach(hw => {
        if (!hw.deadline) {
            longTerm.push(hw);
            return;
        }

        const deadlineDate = new Date(hw.deadline);
        if (isNaN(deadlineDate.getTime())) {
            longTerm.push(hw);
            return;
        }

        // Only include future or "very recent" past (e.g. today)
        // Set both to midnight for better comparison
        const todayReset = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const deadlineReset = new Date(deadlineDate.getFullYear(), deadlineDate.getMonth(), deadlineDate.getDate());

        if (deadlineReset < todayReset) {
            longTerm.push(hw);
            return;
        }

        if (deadlineDate <= threshold) {
            const dateStr = `${String(deadlineDate.getDate()).padStart(2, '0')}/${String(deadlineDate.getMonth() + 1).padStart(2, '0')}`;
            const dayName = thaiDays[deadlineDate.getDay()];
            const groupKey = `## ${dayName} (${dateStr})`;

            if (!groupings[groupKey]) groupings[groupKey] = [];
            groupings[groupKey].push(hw);
        } else {
            longTerm.push(hw);
        }
    });

    let message = headerDate + "\n";

    // Find unique keys for daily groups in order of dates
    const keys = [];
    sortedHw.forEach(hw => {
        if (!hw.deadline) return;
        const deadlineDate = new Date(hw.deadline);
        if (deadlineDate <= threshold && deadlineDate >= new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
            const dateStr = `${String(deadlineDate.getDate()).padStart(2, '0')}/${String(deadlineDate.getMonth() + 1).padStart(2, '0')}`;
            const dayName = thaiDays[deadlineDate.getDay()];
            const groupKey = `## ${dayName} (${dateStr})`;
            if (!keys.includes(groupKey)) keys.push(groupKey);
        }
    });

    keys.forEach(key => {
        message += `${key}\n`;
        groupings[key].forEach(hw => {
            message += `- ${hw.subject} : ${hw.title}${hw.note ? ' ' + hw.note : ''}\n`;
        });
    });

    // Add "งานดองเค็ม" (Long term / Unscheduled)
    if (longTerm.length > 0) {
        message += "\n## งานดองเค็ม\n";
        longTerm.forEach(hw => {
            let dateSuffix = "";
            if (hw.deadline) {
                const date = new Date(hw.deadline);
                if (!isNaN(date.getTime())) {
                    dateSuffix = ` (${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')})`;
                }
            }
            message += `- ${hw.subject} : ${hw.title}${dateSuffix}\n`;
        });
    }

    message += "\nเนื้อหาทั้งหมดอยู่ใน link นี้\n";
    message += "```https://pepsealsea.github.io/kanban/```\n\n";
    message += "> Have question **Reply** to this Bot. || <@&1162383289575817326> ||";

    return message;
}

// --- LEARNING CONTENT SYSTEM FUNCTIONS ---

/**
 * Fetch learning content, optionally filtered by date or id
 */
function getLearningContent(date, id) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEETS.LEARNING_CONTENT);
    if (!sheet || sheet.getLastRow() < 2) return [];

    let rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();
    let data = _toObjects(rows, ["id", "date", "subject", "title", "description", "audio_file_id", "audio_url", "attachments", "links", "created_at"]);

    if (id) {
        return data.filter(item => String(item.id) === String(id));
    }
    if (date) {
        return data.filter(item => {
            const itemDate = new Date(item.date);
            const filterDate = new Date(date);
            return itemDate.getFullYear() === filterDate.getFullYear() &&
                   itemDate.getMonth() === filterDate.getMonth() &&
                   itemDate.getDate() === filterDate.getDate();
        });
    }
    return data;
}

/**
 * Add new learning content
 */
function addLearningContent(date, subject, title, description, audioFileId, audioUrl, attachments, links) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEETS.LEARNING_CONTENT);
    const id = "LC-" + Date.now().toString();
    
    sheet.appendRow([
        id, 
        date || new Date(), 
        subject || "", 
        title || "", 
        description || "", 
        audioFileId || "", 
        audioUrl || "", 
        attachments || "", 
        links || "", 
        new Date()
    ]);
    
    return id;
}

/**
 * Edit existing learning content
 */
function editLearningContent(id, date, subject, title, description, audioFileId, audioUrl, attachments, links) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEETS.LEARNING_CONTENT);
    if (!sheet) return false;

    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(id)) {
            const row = i + 1;
            if (date !== undefined) sheet.getRange(row, 2).setValue(date);
            if (subject !== undefined) sheet.getRange(row, 3).setValue(subject);
            if (title !== undefined) sheet.getRange(row, 4).setValue(title);
            if (description !== undefined) sheet.getRange(row, 5).setValue(description);
            if (audioFileId !== undefined) sheet.getRange(row, 6).setValue(audioFileId);
            if (audioUrl !== undefined) sheet.getRange(row, 7).setValue(audioUrl);
            if (attachments !== undefined) sheet.getRange(row, 8).setValue(attachments);
            if (links !== undefined) sheet.getRange(row, 9).setValue(links);
            return true;
        }
    }
    return false;
}

/**
 * Delete learning content
 */
function deleteLearningContent(id) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEETS.LEARNING_CONTENT);
    if (!sheet) return false;

    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(id)) {
            sheet.deleteRow(i + 1);
            return true;
        }
    }
    return false;
}
