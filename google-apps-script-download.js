/**
 * Saves an image from a URL directly to your specific Google Drive folder.
 * Folder ID: 1xVX82FFBuH1rp4VwnM2jYdmrRhBu01uw
 */

const folderId = "10CuQpxSeJiv_gDRAnL2fOVKIr0jLap6Y";
const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1478774323874500640/3jwe9TnrxPJNCOJkPFln6OP1Ts1zxYhDaMC1FnIt5CzBhJwFDn-ogkMw-XYWtYr5eNVl";

//removed folder not used just remove it
const removedFolderId = "";

// Database connection (Shared Sheet)
const SHEET_ID = '1KKYw0kjsRyzs-cfxFrzHh5ZYtu35eRad2x6IXhE_fE4';
const URLS_SHEET_NAME = 'URLs'; // but want to add in main to

const MAIN_SHEETS = {
    USERS: "Users",
    PROGRESS: "Progress",
};

function doGet(e) {
    return createResponse(true, 'Upload service is online');
}

function doOptions(e) {
    return createResponse(true, 'CORS Preflight Success');
}

/**
 * Creates an embeddable thumbnail URL for an image in Google Drive.
 */
function generateImageThumbnailUrl(fileId) {
    return "https://lh3.googleusercontent.com/u/0/d/" + fileId;
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

        // Check for multipart in multiple ways
        if (e.postData) {
            if (e.postData.type && (e.postData.type.indexOf('multipart') !== -1 || e.postData.type.indexOf('form-data') !== -1)) {
                isMultipart = true;
            }
            // Also check if we have parameters with file data (indicates multipart was parsed)
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
                // Not JSON
                if (!isMultipart && typeof e.postData.contents !== 'string') {
                    if (e.postData.contents.getBytes) isMultipart = true;
                }
            }
        }

        // Special handling for text-only base64 upload (CORS friendly)
        // If request body is a plain string and action is in URL
        var action = params.action || postData.action;

        // HELPER: Unified response and logging logic
        const processFileAndResponse = (file, filename, contentType, email, homeworkId, status, action) => {
            file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            const driveId = file.getId();

            // Only generate thumbnail URL if it's actually an image
            const isActualImage = contentType && contentType.toLowerCase().indexOf('image/') !== -1;
            const thumbnail = isActualImage ? generateImageThumbnailUrl(driveId) : null;
            const viewUrl = 'https://drive.google.com/file/d/' + driveId + '/view';

            logUploadToSheet(driveId, viewUrl, filename, contentType);

            // Create a URL that includes the filename in the hash so we can recover it later
            const finalUrl = (thumbnail || viewUrl) + "#" + encodeURIComponent(filename);

            if (action === 'uploadProof' && email && homeworkId) {
                _updateProgressProof(email, homeworkId, status, finalUrl);
            }

            return createResponse(true, 'Upload successful', {
                driveId: driveId,
                // If it's an image, we want the embeddable thumbnail. Otherwise, the view link.
                url: finalUrl,
                thumbnail: thumbnail,
                directUrl: viewUrl,
                downloadUrl: file.getDownloadUrl(),
                viewUrl: viewUrl,
                contentType: contentType,
                filename: filename
            });
        };

        // --- NEW DELETE ACTION ---
        if (action === 'deleteFiles' || action === 'archiveFiles') {
            var driveIds = params.driveIds || postData.driveIds;
            if (typeof driveIds === 'string') {
                try { driveIds = JSON.parse(driveIds); } catch (e) { driveIds = driveIds.split(','); }
            }

            if (!Array.isArray(driveIds) || driveIds.length === 0) {
                return createResponse(false, 'No driveIds provided');
            }

            var processedList = [];
            var errorList = [];

            // If archive is requested, try to get folder, else default to trashing
            var destFolder = null;
            if (action === 'archiveFiles' && removedFolderId) {
                try { destFolder = DriveApp.getFolderById(removedFolderId); } catch (e) { }
            }

            for (var i = 0; i < driveIds.length; i++) {
                var id = driveIds[i];
                try {
                    var file = DriveApp.getFileById(id);

                    if (destFolder && action === 'archiveFiles') {
                        // Move file to archive folder
                        destFolder.addFile(file);
                        var parents = file.getParents();
                        while (parents.hasNext()) {
                            var p = parents.next();
                            if (p.getId() !== removedFolderId) p.removeFile(file);
                        }
                    } else {
                        // Default behavior: move to Trash
                        file.setTrashed(true);
                    }
                    processedList.push(id);
                } catch (err) {
                    errorList.push({ id: id, error: err.toString() });
                }
            }

            return createResponse(true, 'Successfully processed ' + processedList.length + ' files', {
                count: processedList.length,
                errors: errorList
            });
        }

        // Shared parameters for all upload types
        var email = params.email || postData.email || "";
        var homeworkId = params.homework_id || params.homeworkId || postData.homework_id || postData.homeworkId || "";
        var status = params.status || postData.status || "done";

        // 1. Raw body / Base64 upload
        var base64Content = params.content || postData.content || (e.postData ? e.postData.contents : null);
        if ((action === 'upload' || action === 'uploadProof') && base64Content && typeof base64Content === 'string') {
            // Strip data URL prefix if it accidentally leaked through
            if (base64Content.indexOf('base64,') !== -1) {
                base64Content = base64Content.split('base64,')[1];
            }

            var filename = params.filename || postData.filename || ("File_" + new Date().getTime());
            var contentType = params.contentType || postData.contentType || "application/octet-stream";

            // If we have a filename but no extension in the name, try to keep it generic
            if (filename.indexOf('.') === -1 && contentType.indexOf('/') !== -1) {
                var ext = contentType.split('/')[1];
                if (ext && ext.length < 5) filename += "." + ext;
            }

            try {
                const decodedData = Utilities.base64Decode(base64Content);
                const blob = Utilities.newBlob(decodedData, contentType, filename);

                const folder = DriveApp.getFolderById(folderId);
                const file = folder.createFile(blob);

                return processFileAndResponse(file, filename, contentType, email, homeworkId, status, action);
            } catch (e) {
                return createResponse(false, 'Upload decoding failed: ' + e.toString());
            }
        }

        // 2. Handle FormData upload (multipart/form-data) - Google Apps Script automatically parses multipart/form-data into e.parameters
        // Check e.parameters.myFile FIRST as it's the most reliable way
        if (e.parameters && e.parameters.myFile) {
            var fileBlob = null;
            if (Array.isArray(e.parameters.myFile) && e.parameters.myFile.length > 0) {
                fileBlob = e.parameters.myFile[0];
            } else if (e.parameters.myFile && !Array.isArray(e.parameters.myFile)) {
                fileBlob = e.parameters.myFile;
            }

            if (fileBlob) {
                const filename = params.filename || (fileBlob.getName ? fileBlob.getName() : null) || ("Image_" + new Date().getTime());
                const contentType = params.contentType || (fileBlob.getContentType ? fileBlob.getContentType() : null) || "image/jpeg";

                const folder = DriveApp.getFolderById(folderId);
                const file = folder.createFile(fileBlob);
                if (filename) file.setName(filename);

                return processFileAndResponse(file, filename, contentType, email, homeworkId, status, action);
            }
        }

        // 3. Manual Multipart Fallback: Handle multipart/form-data manually if e.parameters didn't work
        // Also try if we have postData.contents that looks like a blob (even if multipart not detected)
        if (isMultipart || (e.postData && e.postData.type && e.postData.type.indexOf('multipart') !== -1) ||
            (e.postData && e.postData.contents && e.postData.contents.getBytes && action === 'upload')) {
            var fileBlob = null;
            var filename = params.filename || ("Image_" + new Date().getTime() + ".jpg");
            var contentType = params.contentType || "image/jpeg";

            // Try to get blob from postData.contents
            if (e.postData && e.postData.contents) {
                // Check if it's already a blob (has getBytes method)
                if (e.postData.contents.getBytes) {
                    // It's a blob - use it directly
                    fileBlob = e.postData.contents;
                    // Try to get content type from blob if available
                    try {
                        var blobType = fileBlob.getContentType();
                        if (blobType && blobType !== 'application/octet-stream') {
                            contentType = blobType;
                        }
                    } catch (ex) { }
                } else if (typeof e.postData.contents === 'string') {
                    // It's a string - try to extract file from multipart string
                    var contentTypeHeader = e.postData.type || 'multipart/form-data';
                    fileBlob = parseMultipartFormData(e.postData.contents, contentTypeHeader);
                } else {
                    // Try to use as blob directly
                    try {
                        if (e.postData.contents.getBlob) {
                            fileBlob = e.postData.contents.getBlob();
                        } else {
                            fileBlob = e.postData.contents;
                        }
                    } catch (ex) {
                        Logger.log('Error using postData.contents as blob: ' + ex.toString());
                    }
                }
            }

            if (fileBlob) {
                const folder = DriveApp.getFolderById(folderId);
                const file = folder.createFile(fileBlob);
                if (filename) file.setName(filename);

                return processFileAndResponse(file, filename, contentType, email, homeworkId, status, action);
            } else {
                return createResponse(false, 'Failed to extract file from multipart data. postData type: ' + (e.postData ? e.postData.type : 'none') + ', has contents: ' + (e.postData && e.postData.contents ? 'yes' : 'no') + ', contents type: ' + (e.postData && e.postData.contents ? typeof e.postData.contents : 'none') + ', isMultipart: ' + isMultipart);
            }
        }

        return createResponse(false, 'Invalid action or missing file. Debug: ' + JSON.stringify(debugInfo));
    } catch (error) {
        return createResponse(false, 'Upload failed: ' + error.toString() + '. Debug: ' + JSON.stringify(debugInfo));
    }
}

function parseMultipartFormData(body, contentType) {
    try {
        // Extract boundary from Content-Type header
        var boundaryMatch = contentType.match(/boundary=([^;]+)/);
        if (!boundaryMatch) return null;

        var boundary = '--' + boundaryMatch[1].trim();
        var parts = body.split(boundary);

        // Find the part with the file (contains Content-Disposition: form-data; name="myFile")
        for (var i = 0; i < parts.length; i++) {
            var part = parts[i];
            if (part.indexOf('name="myFile"') !== -1 || part.indexOf("name='myFile'") !== -1) {
                // Extract the file content (after the headers and blank line)
                var headerEnd = part.indexOf('\r\n\r\n');
                if (headerEnd === -1) headerEnd = part.indexOf('\n\n');
                if (headerEnd === -1) continue;

                var fileContent = part.substring(headerEnd).replace(/^[\r\n]+/, '').replace(/[\r\n]+$/, '');

                // Extract content type if available
                var contentTypeMatch = part.match(/Content-Type:\s*([^\r\n]+)/i);
                var fileContentType = contentTypeMatch ? contentTypeMatch[1].trim() : 'image/jpeg';

                // Try to convert to blob - file content might be binary or base64
                try {
                    // First try as base64 (if it's encoded)
                    var bytes = Utilities.base64Decode(fileContent);
                    return Utilities.newBlob(bytes, fileContentType);
                } catch (e) {
                    // If base64 decode fails, try as raw binary string
                    try {
                        var bytes = [];
                        for (var j = 0; j < fileContent.length; j++) bytes.push(fileContent.charCodeAt(j) & 0xFF);
                        return Utilities.newBlob(bytes, fileContentType);
                    } catch (e2) {
                        Logger.log('Error creating blob from multipart: ' + e2.toString());
                    }
                }
            }
        }
    } catch (e) {
        Logger.log('Error parsing multipart: ' + e.toString());
    }
    return null;
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


/**
 * BACKGROUND TASK: Specialized for File Cleanup
 * Finds expired links in the sheet that HAVE a Drive ID and trashes the files.
 * NOTE: Ensure this email has "Editor" access to the Google Sheet.
 */
function cleanupExpiredFiles() {
    try {
        const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
        const sheet = spreadsheet.getSheetByName(URLS_SHEET_NAME);
        if (!sheet) return;

        const data = sheet.getDataRange().getValues();
        const now = new Date();
        let deletedCount = 0;

        // Iterate backwards
        for (let i = data.length - 1; i >= 1; i--) {
            const expiryDateStr = data[i][5];
            const driveId = data[i][6];

            // ONLY PROCESS FILES: Links without files are handled by the other script
            if (!driveId) continue;

            if (expiryDateStr) {
                const expiry = new Date(expiryDateStr);
                if (expiry < now) {
                    try {
                        // Delete the file from this account's Drive
                        DriveApp.getFileById(driveId).setTrashed(true);
                    } catch (e) {
                        Logger.log('File already gone or error: ' + driveId);
                    }

                    // Remove entry from sheet
                    sheet.deleteRow(i + 1);
                    deletedCount++;
                }
            }
        }

        Logger.log('Cleaned up ' + deletedCount + ' expired files.');
    } catch (error) {
        Logger.log('Backup Cleanup Error: ' + error.toString());
    }
}

function downloadImageToDrive() {
    const imageUrl = "https://picsum.photos/800/600";
    try {
        const response = UrlFetchApp.fetch(imageUrl);
        const blob = response.getBlob();
        const folder = DriveApp.getFolderById(folderId);
        const fileName = "Image_" + new Date().toISOString() + ".jpg";
        const file = folder.createFile(blob).setName(fileName);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) {
        console.log("Error: " + e.toString());
    }
}

function batchDownloadFromList(urlArray) {
    const folder = DriveApp.getFolderById(folderId);
    urlArray.forEach((url, index) => {
        const blob = UrlFetchApp.fetch(url).getBlob();
        folder.createFile(blob).setName("Batch_Image_" + index);
    });
}

/**
 * Logs upload metadata to the main spreadsheet's URLs sheet.
 * Compatible with cleanupExpiredFiles format.
 */
function logUploadToSheet(driveId, url, filename, contentType) {
    try {
        const ss = SpreadsheetApp.openById(SHEET_ID);
        let sheet = ss.getSheetByName(URLS_SHEET_NAME);

        if (!sheet) {
            sheet = ss.insertSheet(URLS_SHEET_NAME);
            sheet.appendRow(["ID", "Name", "Type", "URL", "Created At", "Expiry Date", "Drive ID"]);
        }

        const now = new Date();
        // Default expiry: 30 days from now (matching cleanup script expectations)
        const expiry = new Date();
        expiry.setDate(now.getDate() + 30);

        sheet.appendRow([
            Utilities.getUuid(),
            filename,
            contentType,
            url,
            now,
            expiry,
            driveId
        ]);
    } catch (err) {
        Logger.log("Failed to log to sheet: " + err.toString());
    }
}

function _updateProgressProof(email, homeworkId, status, imageUrl) {
    if (!email) throw new Error("missing email");
    if (!homeworkId && homeworkId !== 0) throw new Error("missing homework_id");

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const progress = ss.getSheetByName(MAIN_SHEETS.PROGRESS);
    if (!progress) throw new Error("Progress sheet not found");

    const data = progress.getLastRow() > 1
        ? progress.getRange(2, 1, progress.getLastRow() - 1, 5).getValues()
        : [];

    const idx = data.findIndex(r => String(r[0]).toLowerCase() === String(email).toLowerCase() && String(r[1]) === String(homeworkId));

    if (idx === -1) {
        progress.appendRow([email, homeworkId, status || "done", imageUrl || "", new Date()]);
        return;
    }

    const targetRow = idx + 2;
    const currentUrlVal = String(progress.getRange(targetRow, 4).getValue() || "");
    let urlList = currentUrlVal ? currentUrlVal.split(',') : [];
    if (imageUrl && !urlList.includes(imageUrl)) {
        urlList.push(imageUrl);
    }

    progress.getRange(targetRow, 3).setValue(status || "done");
    progress.getRange(targetRow, 4).setValue(urlList.join(','));
    progress.getRange(targetRow, 5).setValue(new Date());

    // Send Discord Notification for the new attachment
    try {
        const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
        // Get User Name
        const usersSheet = spreadsheet.getSheetByName("Users");
        const usersData = usersSheet.getDataRange().getValues();
        const userRow = usersData.find(r => String(r[0]).toLowerCase() === String(email).toLowerCase());
        const studentName = userRow ? userRow[1] : email;

        // Get Homework Title
        const hwSheet = spreadsheet.getSheetByName("Homework");
        const hwData = hwSheet.getDataRange().getValues();
        const hwRow = hwData.find(r => String(r[0]) === String(homeworkId));
        const hwTitle = hwRow ? hwRow[2] : "Homework";

        sendSubmissionNotification(studentName, hwTitle, status || "done", imageUrl);
    } catch (e) {
        Logger.log("Notification error: " + e.toString());
    }
}

function sendSubmissionNotification(studentName, homeworkTitle, status, content) {
    if (!DISCORD_WEBHOOK_URL) return;

    const isFile = content.includes("http");
    const label = isFile ? "📎 New Attachment" : "📣 New Progress Update";
    const color = isFile ? 3447003 : 15105570; // Blue for files, Orange for updates

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
