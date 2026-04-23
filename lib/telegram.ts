/**
 * High-Speed Telegram Upload Service
 * Bypasses Google Apps Script for maximum performance.
 */

const BOT_TOKEN = process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID;

export interface TelegramUploadResult {
  success: boolean;
  fileId: string;
  url: string;
  error?: string;
}

/**
 * Uploads a file directly to Telegram using multipart/form-data.
 */
export async function uploadToTelegramDirect(
  file: File,
  type: 'image' | 'audio' | 'document' = 'document'
): Promise<TelegramUploadResult> {
  if (!BOT_TOKEN || !CHAT_ID) {
    return { success: false, fileId: '', url: '', error: 'Telegram credentials missing in environment' };
  }

  try {
    let method = 'sendDocument';
    let field = 'document';

    if (type === 'image' || file.type.startsWith('image/')) {
      method = 'sendPhoto';
      field = 'photo';
    } else if (type === 'audio' || file.type.startsWith('audio/')) {
      method = 'sendAudio';
      field = 'audio';
    }

    const formData = new FormData();
    formData.append('chat_id', CHAT_ID);
    formData.append(field, file);
    
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      body: formData,
    });

    let result = await response.json();

    // If sendAudio/sendPhoto fails, retry as a generic document (more reliable for large files)
    if (!result.ok && method !== 'sendDocument') {
      console.warn(`Telegram ${method} failed, retrying as sendDocument...`);
      const retryFormData = new FormData();
      retryFormData.append('chat_id', CHAT_ID);
      retryFormData.append('document', file);
      
      const retryRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
        method: 'POST',
        body: retryFormData,
      });
      result = await retryRes.json();
      method = 'sendDocument';
    }

    if (!result.ok) {
      throw new Error(result.description || 'Telegram API error');
    }

    // Extract file_id
    let fileId = '';
    if (method === 'sendPhoto' && result.result.photo) {
      fileId = result.result.photo[result.result.photo.length - 1].file_id;
    } else if (method === 'sendAudio' && result.result.audio) {
      fileId = result.result.audio.file_id;
    } else {
      fileId = result.result.document?.file_id || result.result.file_id;
    }

    // Get file path for the temporary URL
    const fileInfoRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
    const fileInfo = await fileInfoRes.json();
    
    if (!fileInfo.ok) {
      throw new Error('Failed to get file path from Telegram');
    }

    const tempUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.result.file_path}`;

    return {
      success: true,
      fileId: fileId,
      url: tempUrl
    };
  } catch (error: any) {
    console.error('Direct Telegram Upload Failed:', error);
    return {
      success: false,
      fileId: '',
      url: '',
      error: error.message
    };
  }
}

/**
 * Fetches a fresh download URL for a given Telegram fileId.
 * Bypasses GAS to avoid bandwidth quotas.
 */
export async function getFreshTelegramUrl(fileId: string): Promise<string | null> {
  if (!BOT_TOKEN) return null;
  
  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
    const result = await response.json();
    
    if (result.ok && result.result.file_path) {
      return `https://api.telegram.org/file/bot${BOT_TOKEN}/${result.result.file_path}`;
    }
  } catch (err) {
    console.error('Error getting fresh Telegram URL:', err);
  }
  return null;
}
