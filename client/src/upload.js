import { api } from "./api.js";

// matches the server's inline-image ceiling — the fallback path only
const MAX_INLINE_BYTES = 200_000;

// CDN uploads are downscaled server-side, so phones can send real photos
const MAX_UPLOAD_BYTES = 5_000_000;

export const readAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

/**
 * Uploads an image and returns a URL to store.
 *
 * Tries Cloudinary first. If the server has no credentials configured (or
 * the upload fails), it quietly falls back to an inline data URL so the app
 * keeps working on a bare local setup.
 *
 * → { ok: true, url, stored: "cdn" | "inline" } | { ok: false, message }
 */
export async function uploadImage(file, { getToken, folder = "canteen" } = {}) {
    if (!file) return { ok: false, message: "No file selected" };

    if (file.size > MAX_UPLOAD_BYTES) {
        return { ok: false, message: "Image too large — keep it under 5MB" };
    }

    let dataUrl;
    try {
        dataUrl = await readAsDataUrl(file);
    } catch {
        return { ok: false, message: "Could not read that file" };
    }

    const res = await api("/api/uploads", {
        method: "POST",
        getToken,
        body: { dataUrl, folder },
    });

    if (res.ok && res.data.url) {
        return { ok: true, url: res.data.url, stored: "cdn" };
    }

    // fallback: store it inline, subject to the tighter inline budget
    if (dataUrl.length > MAX_INLINE_BYTES * 1.5) {
        return {
            ok: false,
            message:
                res.data.message ||
                "Upload failed and the image is too large to store inline",
        };
    }

    return { ok: true, url: dataUrl, stored: "inline" };
}
