/**
 * Client-Side Audio Compressor (Worker-Enabled)
 * Runs compression in a background worker to prevent UI freezing and show progress.
 */

export interface CompressionResult {
    file: File;
    compressed: boolean;
    originalSize: number;
    newSize: number;
}

/**
 * Compresses an audio file using a Web Worker.
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

    console.log(`Starting worker-based compression: ${file.name}`);

    return new Promise(async (resolve, reject) => {
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

            // Start Worker
            const worker = new Worker('/audio-worker.js');
            
            worker.onmessage = (e) => {
                const { type, progress, data, error } = e.data;
                
                if (type === 'progress' && onProgress) {
                    onProgress(progress || 0);
                } else if (type === 'done') {
                    const blob = new Blob(data, { type: 'audio/mp3' });
                    const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + "_compressed.mp3", {
                        type: 'audio/mp3'
                    });
                    
                    worker.terminate();
                    resolve({
                        file: compressedFile,
                        compressed: true,
                        originalSize: file.size,
                        newSize: compressedFile.size
                    });
                } else if (type === 'error') {
                    worker.terminate();
                    reject(new Error(error));
                }
            };

            worker.onerror = (err) => {
                worker.terminate();
                reject(err);
            };

            // Send data to worker (using transferable objects for speed)
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
