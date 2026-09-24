/**
 * Order-alert sounds via the Web Audio API — no audio files, no dependencies.
 *
 * Two cues:
 *   - "new"  → two rising tones  (vendor: a new order landed)
 *   - "done" → three-note chime  (customer: your order is ready)
 *
 * Browsers block audio until the user has interacted with the page, so every
 * call goes through a lazily-created AudioContext that resumes itself on the
 * first failure — after any click/tap it will always work.
 */

let ctx = null;

function getCtx() {
    if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
}

function tone(freq, start, duration, gain = 0.06) {
    const audio = getCtx();
    if (!audio) return;

    const osc = audio.createOscillator();
    const vol = audio.createGain();

    osc.type = "sine";
    osc.frequency.value = freq;

    vol.gain.setValueAtTime(0, audio.currentTime + start);
    vol.gain.linearRampToValueAtTime(gain, audio.currentTime + start + 0.02);
    vol.gain.exponentialRampToValueAtTime(
        0.0001,
        audio.currentTime + start + duration,
    );

    osc.connect(vol).connect(audio.destination);
    osc.start(audio.currentTime + start);
    osc.stop(audio.currentTime + start + duration + 0.05);
}

export function playNewOrderSound() {
    // rising pair — "something needs you"
    tone(660, 0, 0.18);
    tone(880, 0.16, 0.25);
}

export function playReadySound() {
    // gentle three-note chime — "your food is up"
    tone(523, 0, 0.15);
    tone(659, 0.14, 0.15);
    tone(784, 0.28, 0.3);
}
