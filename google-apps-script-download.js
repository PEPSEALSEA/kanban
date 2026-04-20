/**
 * Saves an image from a URL directly to your specific Google Drive folder.
 * Folder ID: 1xVX82FFBuH1rp4VwnM2jYdmrRhBu01uw
 */

const folderId = "10CuQpxSeJiv_gDRAnL2fOVKIr0jLap6Y";
const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1478774323874500640/3jwe9TnrxPJNCOJkPFln6OP1Ts1zxYhDaMC1FnIt5CzBhJwFDn-ogkMw-XYWtYr5eNVl";

// Telegram Configuration (Set these in File > Project Settings > Script Properties)
// Or run setupTelegram() once with your values.
const TELEGRAM_CONFIG = {
    get BOT_TOKEN() { return PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN') || "" },
    get CHAT_ID() { return PropertiesService.getScriptProperties().getProperty('TELEGRAM_CHAT_ID') || "" }
};

// Database connection (Shared Sheet)
const SHEET_ID = '1KKYw0kjsRyzs-cfxFrzHh5ZYtu35eRad2x6IXhE_fE4';
const URLS_SHEET_NAME = 'URLs';

const MAIN_SHEETS = {
    USERS: "Users",
    PROGRESS: "Progress",
};

function doGet(e) {
    var params = e.parameter || {};
    var action = params.action;
    var fileId = params.fileId;
    var refresh = params.refresh === "true";

    // --- TELEGRAM LINK GETTER / REFRESHER ---
    if (action === "getFreshLink" && fileId) {
        const props = PropertiesService.getScriptProperties();
        const cacheKey = "tg_link_" + fileId;
        
        if (refresh) {
            try {
                const botToken = TELEGRAM_CONFIG.BOT_TOKEN;
                const getFileUrl = "https://api.telegram.org/bot" + botToken + "/getFile?file_id=" + fileId;
                const response = UrlFetchApp.fetch(getFileUrl);
                const filePath = JSON.parse(response.getContentText()).result.file_path;
                const newLink = "https://api.telegram.org/file/bot" + botToken + "/" + filePath;
                
                props.setProperty(cacheKey, newLink);
                return createResponse(true, 'Link refreshed', { url: newLink });
            } catch (err) {
                return createResponse(false, 'Failed to refresh link: ' + err.message);
            }
        }

        const cachedLink = props.getProperty(cacheKey) || "";
        return createResponse(true, 'Link retrieved', { url: cachedLink });
    }

    return createResponse(true, 'Upload service is online');
}

function doOptions(e) {
    return createResponse(true, 'CORS Preflight Success');
}

/**
 * Uploads a file to Telegram and returns the file_id and temporary URL.
 */
function uploadToTelegram(blob, filename, contentType) {
    const botToken = TELEGRAM_CONFIG.BOT_TOKEN;
    const chatId = TELEGRAM_CONFIG.CHAT_ID;

    if (!botToken || !chatId) {
        throw new Error("Telegram Bot Token or Chat ID not configured in Script Properties");
    }

    // Determine Telegram method
    let method = "sendDocument";
    let payloadField = "document";
    
    if (contentType && contentType.indexOf('image/') !== -1) {
        method = "sendPhoto";
        payloadField = "photo";
    } else if (contentType && contentType.indexOf('audio/') !== -1) {
        method = "sendAudio";
        payloadField = "audio";
    }

    const apiUrl = "https://api.telegram.org/bot" + botToken + "/" + method;
    
    const payload = {
        chat_id: chatId,
        caption: filename || "Uploaded via StudyFlow"
    };
    payload[payloadField] = blob;

    const options = {
        method: "post",
        payload: payload,
        muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(apiUrl, options);
    const result = JSON.parse(response.getContentText());

    if (!result.ok) {
        throw new Error("Telegram API Error: " + result.description);
    }

    // Get file_id from response
    let fileId = "";
    if (method === "sendPhoto") {
        // Photos have an array of sizes, use the largest
        fileId = result.result.photo[result.result.photo.length - 1].file_id;
    } else if (method === "sendAudio") {
        fileId = result.result.audio.file_id;
    } else {
        fileId = result.result.document.file_id;
    }

    // Get temporary file path
    const getFileUrl = "https://api.telegram.org/bot" + botToken + "/getFile?file_id=" + fileId;
    const fileResponse = UrlFetchApp.fetch(getFileUrl);
    const filePath = JSON.parse(fileResponse.getContentText()).result.file_path;
    const tempUrl = "https://api.telegram.org/file/bot" + botToken + "/" + filePath;

    // Cache the link
    PropertiesService.getScriptProperties().setProperty("tg_link_" + fileId, tempUrl);

    return { fileId: fileId, url: tempUrl };
}

function doPost(e) {
    var debugInfo = {
        hasParameters: !!e.parameters,
        parameterKeys: e.parameters ? Object.keys(e.parameters) : [],
        hasPostData: !!e.postData,
        postDataType: e.postData ? e.postData.type : null,
        hasContents: !!(e.postData && e.postData.contents),
        contentsType: e.postData && e.postData.contents ? typeof e.postData.contents : null
    };

    try {
        var params = e.parameter || {};
        var postData = {};
        var isMultipart = false;

        if (e.postData) {
            if (e.postData.type && (e.postData.type.indexOf('multipart') !== -1 || e.postData.type.indexOf('form-data') !== -1)) {
                isMultipart = true;
            }
            if (e.parameters && Object.keys(e.parameters).length > 0) {
                for (var key in e.parameters) {
                    if (e.parameters.hasOwnProperty(key)) {
                        var val = e.parameters[key];
                        if (val && (val.getBytes || (Array.isArray(val) && val.length > 0 && val[0].getBytes))) {
                            isMultipart = true;
                            break;
                        }
                    }
                }
            }
        }

        if (e.postData && e.postData.contents) {
            try {
                postData = JSON.parse(e.postData.contents);
            } catch (ex) {
                if (!isMultipart && typeof e.postData.contents !== 'string') {
                    if (e.postData.contents.getBytes) isMultipart = true;
                }
            }
        }

        var action = params.action || postData.action;
        var email = params.email || postData.email || "";
        var homeworkId = params.homework_id || params.homeworkId || postData.homework_id || postData.homeworkId || "";
        var status = params.status || postData.status || "done";

        // --- UNIFIED TELEGRAM UPLOAD LOGIC ---
        const handleTelegramUpload = (blob, filename, contentType) => {
            const result = uploadToTelegram(blob, filename, contentType);
            const finalUrl = result.url + "#" + encodeURIComponent(filename);

            if (action === 'uploadProof' && email && homeworkId) {
                _updateProgressProof(email, homeworkId, status, finalUrl);
            }

            // Still log to sheet for record keeping (optional)
            logUploadToSheet(result.fileId, result.url, filename, contentType);

            return createResponse(true, 'Upload successful', {
                id: result.fileId,
                fileId: result.fileId,
                url: finalUrl,
                tempUrl: result.url,
                contentType: contentType,
                filename: filename
            });
        };

        // 1. Audio Upload Action
        if (action === 'uploadAudio') {
            let fileBlob = null;
            let filename = params.filename || ("Audio_" + new Date().getTime() + ".mp3");
            let contentType = params.contentType || "audio/mpeg";

            if (e.parameters && e.parameters.myFile) {
                fileBlob = Array.isArray(e.parameters.myFile) ? e.parameters.myFile[0] : e.parameters.myFile;
            } else if (e.postData && e.postData.contents) {
                let contentStr = e.postData.contents;
                if (typeof contentStr === 'string') {
                    const base64Content = contentStr.indexOf('base64,') !== -1 ? contentStr.split('base64,')[1] : contentStr;
                    const decoded = Utilities.base64Decode(base64Content);
                    fileBlob = Utilities.newBlob(decoded, contentType, filename);
                } else {
                    fileBlob = e.postData.contents;
                }
            }

            if (fileBlob) {
                return handleTelegramUpload(fileBlob, filename, contentType);
            }
            return createResponse(false, 'No audio file provided');
        }

        // 2. Base64 Upload
        var base64Content = params.content || postData.content || (e.postData ? e.postData.contents : null);
        if ((action === 'upload' || action === 'uploadProof') && base64Content && typeof base64Content === 'string') {
            if (base64Content.indexOf('base64,') !== -1) {
                base64Content = base64Content.split('base64,')[1];
            }

            var filename = params.filename || postData.filename || ("File_" + new Date().getTime());
            var contentType = params.contentType || postData.contentType || "application/octet-stream";

            if (filename.indexOf('.') === -1 && contentType.indexOf('/') !== -1) {
                var ext = contentType.split('/')[1];
                if (ext && ext.length <= 6) {
                    if (ext === 'x-m4a') ext = 'm4a';
                    filename += "." + ext;
                }
            }

            try {
                const decodedData = Utilities.base64Decode(base64Content);
                const blob = Utilities.newBlob(decodedData, contentType, filename);
                return handleTelegramUpload(blob, filename, contentType);
            } catch (e) {
                return createResponse(false, 'Upload decoding failed: ' + e.toString());
            }
        }

        // 3. FormData Upload
        if (e.parameters && e.parameters.myFile) {
            var fileBlob = Array.isArray(e.parameters.myFile) ? e.parameters.myFile[0] : e.parameters.myFile;
            if (fileBlob) {
                const filename = params.filename || (fileBlob.getName ? fileBlob.getName() : null) || ("Image_" + new Date().getTime());
                const contentType = params.contentType || (fileBlob.getContentType ? fileBlob.getContentType() : null) || "image/jpeg";
                return handleTelegramUpload(fileBlob, filename, contentType);
            }
        }

        // 4. Delete Action (Keep as Drive delete for now if drive IDs are passed, but might need Telegram delete later)
        if (action === 'deleteFiles' || action === 'archiveFiles') {
            // ... (keep existing drive cleanup for legacy or mixed use)
        }

        return createResponse(false, 'Invalid action or missing file. Debug: ' + JSON.stringify(debugInfo));
    } catch (error) {
        return createResponse(false, 'Upload failed: ' + error.toString() + '. Debug: ' + JSON.stringify(debugInfo));
    }
}

function createResponse(success, message, data) {
    var dataObj = data || {};
    var result = {
        success: success,
        message: message
    };
    for (var key in dataObj) {
        if (dataObj.hasOwnProperty(key)) {
            result[key] = dataObj[key];
        }
    }
    return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
}

function logUploadToSheet(driveId, url, filename, contentType) {
    try {
        const ss = SpreadsheetApp.openById(SHEET_ID);
        let sheet = ss.getSheetByName(URLS_SHEET_NAME);
        if (!sheet) {
            sheet = ss.insertSheet(URLS_SHEET_NAME);
            sheet.appendRow(["ID", "Name", "Type", "URL", "Created At", "Expiry Date", "Drive ID"]);
        }
        const now = new Date();
        const expiry = new Date();
        expiry.setDate(now.getDate() + 30);
        sheet.appendRow([Utilities.getUuid(), filename, contentType, url, now, expiry, driveId]);
    } catch (err) {
        Logger.log("Failed to log to sheet: " + err.toString());
    }
}

function _updateProgressProof(email, homeworkId, status, imageUrl) {
    if (!email || (!homeworkId && homeworkId !== 0)) return;
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const progress = ss.getSheetByName(MAIN_SHEETS.PROGRESS);
    if (!progress) return;

    const data = progress.getLastRow() > 1 ? progress.getRange(2, 1, progress.getLastRow() - 1, 5).getValues() : [];
    const idx = data.findIndex(r => String(r[0]).toLowerCase() === String(email).toLowerCase() && String(r[1]) === String(homeworkId));

    if (idx === -1) {
        progress.appendRow([email, homeworkId, status || "done", imageUrl || "", new Date()]);
    } else {
        const targetRow = idx + 2;
        const currentUrlVal = String(progress.getRange(targetRow, 4).getValue() || "");
        let urlList = currentUrlVal ? currentUrlVal.split(',') : [];
        if (imageUrl && !urlList.includes(imageUrl)) urlList.push(imageUrl);
        progress.getRange(targetRow, 3).setValue(status || "done");
        progress.getRange(targetRow, 4).setValue(urlList.join(','));
        progress.getRange(targetRow, 5).setValue(new Date());
    }

    try {
        const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
        const usersSheet = spreadsheet.getSheetByName("Users");
        const usersData = usersSheet.getDataRange().getValues();
        const userRow = usersData.find(r => String(r[0]).toLowerCase() === String(email).toLowerCase());
        const studentName = userRow ? userRow[1] : email;

        const hwSheet = spreadsheet.getSheetByName("Homework");
        const hwData = hwSheet.getDataRange().getValues();
        const hwRow = hwData.find(r => String(r[0]) === String(homeworkId));
        const hwTitle = hwRow ? hwRow[2] : "Homework";

        sendSubmissionNotification(studentName, hwTitle, status || "done", imageUrl);
    } catch (e) { }
}

function sendSubmissionNotification(studentName, homeworkTitle, status, content) {
    if (!DISCORD_WEBHOOK_URL) return;
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

    UrlFetchApp.fetch(DISCORD_WEBHOOK_URL, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    });
}
