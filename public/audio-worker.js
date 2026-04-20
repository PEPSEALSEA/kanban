/**
 * Audio Compression Worker
 * Runs the heavy MP3 encoding in a background thread to prevent UI freezing.
 */

self.onmessage = async function(e) {
    const { left, right, channels, sampleRate, bitrate } = e.data;
    
    try {
        // Load lamejs from CDN inside worker
        importScripts('https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js');
        
        // @ts-ignore
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
            
            // Report progress every 10% during conversion to Int16 (initial phase)
            if (i % Math.floor(totalSamples / 10) === 0) {
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
            if (i % Math.floor(totalSamples / 20) === 0) {
                const encodeProgress = 20 + Math.round((i / totalSamples) * 75);
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
