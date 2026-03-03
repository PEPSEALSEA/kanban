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
};

function doGet(e) {
    const action = e.parameter.action;
    const email = e.parameter.email || "";

    try {
        let result;
        if (action === "list") result = getHomeworkList();
        else if (action === "listWithProgress") result = getHomeworkWithProgress(email);
        else if (action === "progress") result = getProgressByEmail(email);
        else if (action === "users") result = getUserList();
        else throw new Error("unknown action: " + action);

        return _json({ success: true, data: result });
    } catch (err) {
        return _json({ success: false, error: err.message });
    }
}

function doPost(e) {
    try {
        const body = JSON.parse(e.postData.contents);
        const action = body.action;
        let result;

        if (action === "addHomework") {
            result = addHomework(body.subject, body.title, body.description, body.deadline, body.link_work, body.link_image, body.note);
        } else if (action === "addUser") {
            addUser(body.email, body.display_name, body.photo_url);
            result = "ok";
        } else if (action === "updateProgress") {
            updateProgress(body.email, body.homework_id, body.status);
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
    output.setMimeType(ContentService.MimeType.TEXT);
    return output;
}

function setupSheet() {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    _setupHomework(ss);
    _setupUsers(ss);
    _setupProgress(ss);
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
    sheet.getRange(1, 1, 1, 4).setValues([["email", "homework_id", "status", "updated_at"]]);
    sheet.setFrozenRows(1);
    sheet.getRange("C2:C5000").setDataValidation(
        SpreadsheetApp.newDataValidation().requireValueInList(["pending", "in_progress", "done"]).build()
    );
}

function addHomework(subject, title, description, deadline, linkWork, linkImage, note) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEETS.HOMEWORK);
    const id = sheet.getLastRow();
    sheet.appendRow([id, subject, title, description, deadline, linkWork || "", linkImage || "", note || "", new Date()]);
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

function updateProgress(email, homeworkId, status) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEETS.PROGRESS);
    if (!_isUserAllowed(ss, email)) throw new Error("email not allowed");

    const data = sheet.getLastRow() > 1
        ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues()
        : [];
    const rowIndex = data.findIndex(r => r[0] === email && String(r[1]) === String(homeworkId));

    if (rowIndex === -1) {
        sheet.appendRow([email, homeworkId, status, new Date()]);
    } else {
        const targetRow = rowIndex + 2;
        sheet.getRange(targetRow, 3).setValue(status);
        sheet.getRange(targetRow, 4).setValue(new Date());
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
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues()
        .filter(r => r[0] === email)
        .map(r => ({ email: r[0], homework_id: r[1], status: r[2], updated_at: r[3] }));
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
