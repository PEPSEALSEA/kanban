/**
 * Client-Side Audio Compressor
 * Uses lamejs to re-encode audio to a lower bitrate to fit within Telegram's 20MB getFile limit.
 */

// @ts-ignore
import * as lamejs from 'lamejs';

export interface CompressionResult {
  file: File;
  compressed: boolean;
  originalSize: number;
  newSize: number;
}

/**
 * Compresses an audio file if it is larger than the target size.
 * Target is 19MB to be safe for Telegram's 20MB limit.
 */
export async function compressAudioIfNeeded(
  file: File,
  targetMB: number = 19
): Promise<CompressionResult> {
  const targetBytes = targetMB * 1024 * 1024;
  
  if (file.size <= targetBytes) {
    return { file, compressed: false, originalSize: file.size, newSize: file.size };
  }

  console.log(`Starting compression: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);

  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    
    const duration = audioBuffer.duration;
    const channels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;

    // Calculate required bitrate (bits per second)
    // Formula: sizeInBytes * 8 / duration
    let bitrate = Math.floor((targetBytes * 8) / duration / 1000);
    
    // Clamp bitrate to reasonable MP3 values (minimum 32kbps, maximum 128kbps for compression)
    bitrate = Math.max(32, Math.min(128, bitrate));
    
    console.log(`Target Bitrate: ${bitrate}kbps for ${duration.toFixed(1)}s`);

    const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, bitrate);
    const mp3Data: any[] = [];

    // Extract samples
    const left = audioBuffer.getChannelData(0);
    const right = channels > 1 ? audioBuffer.getChannelData(1) : left;

    // Convert Float32 to Int16 for lamejs
    const sampleBlockSize = 1152;
    const leftInt16 = new Int16Array(left.length);
    const rightInt16 = new Int16Array(right.length);

    for (let i = 0; i < left.length; i++) {
      leftInt16[i] = left[i] < 0 ? left[i] * 32768 : left[i] * 32767;
      rightInt16[i] = right[i] < 0 ? right[i] * 32768 : right[i] * 32767;
    }

    for (let i = 0; i < leftInt16.length; i += sampleBlockSize) {
      const leftChunk = leftInt16.subarray(i, i + sampleBlockSize);
      const rightChunk = rightInt16.subarray(i, i + sampleBlockSize);
      const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
      if (mp3buf.length > 0) {
        mp3Data.push(new Uint8Array(mp3buf));
      }
    }

    const endBuf = mp3encoder.flush();
    if (endBuf.length > 0) {
      mp3Data.push(new Uint8Array(endBuf));
    }

    const blob = new Blob(mp3Data, { type: 'audio/mp3' });
    const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + "_compressed.mp3", {
      type: 'audio/mp3'
    });

    console.log(`Compression finished: ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`);

    return {
      file: compressedFile,
      compressed: true,
      originalSize: file.size,
      newSize: compressedFile.size
    };
  } catch (err) {
    console.error('Compression failed:', err);
    throw err;
  }
}
