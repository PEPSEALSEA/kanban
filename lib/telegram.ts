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
  // Debug log (Safe)
  console.log('Telegram Upload Context:', {
    hasToken: !!BOT_TOKEN,
    hasChatId: !!CHAT_ID,
    tokenPrefix: BOT_TOKEN ? BOT_TOKEN.substring(0, 5) + '...' : 'none',
    fileName: file.name,
    fileSize: (file.size / 1024 / 1024).toFixed(2) + 'MB',
    type
  });

  if (!BOT_TOKEN || !CHAT_ID) {
    return { 
      success: false, 
      fileId: '', 
      url: '', 
      error: 'Telegram credentials missing in environment (.env.local)' 
    };
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
    
    let response;
    try {
      response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
        method: 'POST',
        body: formData,
      });
    } catch (fetchErr: any) {
      // This usually happens for CORS or Network errors
      console.error('Fetch error during Telegram upload:', fetchErr);
      if (fetchErr.message === 'Failed to fetch') {
        throw new Error('Network error or CORS blocked. Direct Telegram upload is only possible if your browser allows it or via a proxy.');
      }
      throw fetchErr;
    }

    let result = await response.json();

    // If sendAudio/sendPhoto fails, retry as a generic document (more reliable for large files)
    if (!result.ok && method !== 'sendDocument') {
      console.warn(`Telegram ${method} failed (${result.description}), retrying as sendDocument...`);
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
    let tempUrl = '';
    try {
      const fileInfoRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
      const fileInfo = await fileInfoRes.json();
      
      if (fileInfo.ok && fileInfo.result.file_path) {
        tempUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.result.file_path}`;
      } else {
        // For files > 20MB, getFile fails for bots sometimes. We still have the fileId though!
        console.warn('Telegram getFile failed (likely > 20MB or Bot limitation). Using fileId fallback.');
        tempUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/unknown_path_for_id_${fileId}`;
      }
    } catch (e) {
      console.warn('Error fetching file path, using fileId fallback:', e);
      tempUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/unknown_path_for_id_${fileId}`;
    }

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
