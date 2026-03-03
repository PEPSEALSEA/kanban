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
};

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
                // Not JSON, that's fine, we'll use params
            }
        }

        const action = params.action || postData.action;
        let result;

        if (action === "addHomework") {
            const subject = params.subject || postData.subject;
            const title = params.title || postData.title;
            const description = params.description || postData.description;
            const deadline = params.deadline || postData.deadline;
            const link_work = params.link_work || postData.link_work;
            const link_image = params.link_image || postData.link_image;
            const note = params.note || postData.note;
            result = addHomework(subject, title, description, deadline, link_work, link_image, note);
        } else if (action === "addUser") {
            const email = params.email || postData.email;
            const display_name = params.display_name || postData.display_name;
            const photo_url = params.photo_url || postData.photo_url;
            addUser(email, display_name, photo_url);
            result = "ok";
        } else if (action === "updateProgress") {
            const email = params.email || postData.email;
            const hwId = params.homework_id || params.homeworkId || postData.homework_id || postData.homeworkId;
            const status = params.status || postData.status;
            const imageUrl = params.image_url || params.imageUrl || postData.image_url || postData.imageUrl;
            updateProgress(email, hwId, status, imageUrl);
            result = "ok";
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
    // Ensure header if new
    if (sheet.getLastRow() === 0) {
        sheet.appendRow(["id", "subject", "title", "description", "deadline", "link_work", "link_image", "note", "created_at"]);
    }
    const id = sheet.getLastRow();
    sheet.appendRow([id, subject || "", title || "", description || "", deadline || "", linkWork || "", linkImage || "", note || "", new Date()]);
    return id;
}

function addUser(email, displayName, photoUrl) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEETS.USERS);
    const existingRow = _getUserRow(sheet, email);
    if (existingRow) {
        // Update name and photo if they changed
        sheet.getRange(existingRow, 2, 1, 2).setValues([[displayName || "", photoUrl || ""]]);
    } else {
        sheet.appendRow([email, displayName || "", photoUrl || "", new Date()]);
    }
}

function updateProgress(email, homeworkId, status, imageUrl) {
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
        sheet.getRange(targetRow, 3).setValue(status);
        if (imageUrl !== undefined) {
            sheet.getRange(targetRow, 4).setValue(imageUrl || "");
        }
        sheet.getRange(targetRow, 5).setValue(new Date());
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
    if (sheet.getLastRow() < 2) return [];
    return _toObjects(
        sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues(),
        ["email", "display_name", "photo_url", "created_at"]
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

function _getUserRow(sheet, email) {
    if (sheet.getLastRow() < 2) return null;
    const idx = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().findIndex(r => r[0] === email);
    return idx === -1 ? null : idx + 2;
}

function _toObjects(rows, headers) {
    return rows.filter(r => r[0] !== "").map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i]; });
        return obj;
    });
}
