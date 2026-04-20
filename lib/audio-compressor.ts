/**
 * Client-Side Audio Compressor (Inline Worker-Enabled)
 * Uses a Blob worker to ensure compatibility across all environments without external file dependencies.
 */

export interface CompressionResult {
    file: File;
    compressed: boolean;
    originalSize: number;
    newSize: number;
}

/**
 * The worker code as a string to be converted into a Blob URL.
 */
const WORKER_CODE = `
self.onmessage = async function(e) {
    const { left, right, channels, sampleRate, bitrate } = e.data;
    
    try {
        // Load lamejs from CDN inside worker
        importScripts('https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js');
        
        const mp3encoder = new self.lamejs.Mp3Encoder(channels, sampleRate, bitrate);
        const mp3Data = [];
        
        const sampleBlockSize = 1152;
        const totalSamples = left.length;
        
        // Convert Float32 to Int16
        const leftInt16 = new Int16Array(totalSamples);
        const rightInt16 = new Int16Array(totalSamples);
        
        for (let i = 0; i < totalSamples; i++) {
            leftInt16[i] = left[i] < 0 ? left[i] * 32768 : left[i] * 32767;
            rightInt16[i] = right[i] < 0 ? right[i] * 32768 : right[i] * 32767;
            
            // Report progress every 5% during conversion
            if (i % Math.floor(totalSamples / 20) === 0) {
                self.postMessage({ type: 'progress', progress: Math.round((i / totalSamples) * 20) });
            }
        }

        for (let i = 0; i < totalSamples; i += sampleBlockSize) {
            const leftChunk = leftInt16.subarray(i, i + sampleBlockSize);
            const rightChunk = rightInt16.subarray(i, i + sampleBlockSize);
            const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
            
            if (mp3buf.length > 0) {
                mp3Data.push(new Uint8Array(mp3buf));
            }
            
            // Report progress (20% to 100% phase)
            if (i % Math.floor(totalSamples / 40) === 0) {
                const encodeProgress = 20 + Math.round((i / totalSamples) * 80);
                self.postMessage({ type: 'progress', progress: encodeProgress });
            }
        }

        const endBuf = mp3encoder.flush();
        if (endBuf.length > 0) {
            mp3Data.push(new Uint8Array(endBuf));
        }

        self.postMessage({ type: 'done', data: mp3Data, progress: 100 });
    } catch (err) {
        self.postMessage({ type: 'error', error: err.message });
    }
};
`;

/**
 * Compresses an audio file using an inline Web Worker.
 */
export async function compressAudioIfNeeded(
    file: File,
    onProgress?: (progress: number) => void,
    targetMB: number = 19
): Promise<CompressionResult> {
    const targetBytes = targetMB * 1024 * 1024;
    
    if (file.size <= targetBytes) {
        return { file, compressed: false, originalSize: file.size, newSize: file.size };
    }

    console.log(`Starting inline worker compression: ${file.name}`);

    return new Promise(async (resolve, reject) => {
        let blobUrl: string | null = null;
        let worker: Worker | null = null;

        try {
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            
            const duration = audioBuffer.duration;
            const channels = audioBuffer.numberOfChannels;
            const sampleRate = audioBuffer.sampleRate;

            let bitrate = Math.floor((targetBytes * 8) / duration / 1000);
            bitrate = Math.max(32, Math.min(128, bitrate));

            const left = audioBuffer.getChannelData(0);
            const right = channels > 1 ? audioBuffer.getChannelData(1) : left;

            // Create Inline Worker
            const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
            blobUrl = URL.createObjectURL(blob);
            worker = new Worker(blobUrl);
            
            worker.onmessage = (e) => {
                const { type, progress, data, error } = e.data;
                
                if (type === 'progress' && onProgress) {
                    onProgress(progress || 0);
                } else if (type === 'done') {
                    const mp3Blob = new Blob(data, { type: 'audio/mp3' });
                    const compressedFile = new File([mp3Blob], file.name.replace(/\.[^/.]+$/, "") + "_compressed.mp3", {
                        type: 'audio/mp3'
                    });
                    
                    cleanup();
                    resolve({
                        file: compressedFile,
                        compressed: true,
                        originalSize: file.size,
                        newSize: compressedFile.size
                    });
                } else if (type === 'error') {
                    cleanup();
                    reject(new Error(error));
                }
            };

            worker.onerror = (err) => {
                cleanup();
                console.error('Worker Script Error:', err);
                reject(new Error('Background worker failed to start. This may be due to security policies or CDN blockage.'));
            };

            const cleanup = () => {
                if (worker) worker.terminate();
                if (blobUrl) URL.revokeObjectURL(blobUrl);
            };

            // Send data to worker
            worker.postMessage({
                left,
                right,
                channels,
                sampleRate,
                bitrate
            }, [left.buffer, right.buffer]);

        } catch (err) {
            reject(err);
        }
    });
}
