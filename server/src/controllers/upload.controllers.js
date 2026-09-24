import cloudinary, { cloudinaryConfigured } from "../config/cloudinary.js";

// upper bound on what we hand to Cloudinary: a canteen photo is not 5MB.
// 7.5M chars ≈ 5MB binary (5,000,000 × 4/3 base64 expansion + data URL prefix).
const MAX_UPLOAD_CHARS = 7_500_000;

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// "data:image/png;base64,iVBORw0KG..." → { mime: "image/png", base64: "..." }
const parseDataUrl = (value) => {
    if (typeof value !== "string") return null;

    const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,(.+)$/i.exec(value.trim());
    if (!match) return null;

    return { mime: match[1].toLowerCase(), base64: match[2] };
};

const FOLDERS = {
    qr: "qr-codes",
    menu: "menu-items",
    canteen: "canteens",
};

/**
 * Accepts a base64 data URL and returns a CDN URL.
 * Kept intentionally dumb: the client already downscales, we only store.
 */
export const uploadImage = async (req, res) => {
    if (!cloudinaryConfigured) {
        return res.status(503).json({
            success: false,
            message:
                "Image storage isn't configured — add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET to server/.env.",
        });
    }

    try {
        const { dataUrl, folder } = req.body;

        if (!dataUrl || typeof dataUrl !== "string") {
            return res.status(400).json({
                success: false,
                message: "An image data URL is required!",
            });
        }

        if (dataUrl.length > MAX_UPLOAD_CHARS) {
            return res.status(413).json({
                success: false,
                message: "Image is too large — please pick a smaller file.",
            });
        }

        const parsed = parseDataUrl(dataUrl);
        if (!parsed) {
            return res.status(400).json({
                success: false,
                message: "Only base64 image data URLs are accepted!",
            });
        }

        if (!ALLOWED_TYPES.includes(parsed.mime)) {
            return res.status(400).json({
                success: false,
                message: "Unsupported image type — use JPEG, PNG, WebP or GIF.",
            });
        }

        const target = FOLDERS[folder] || FOLDERS.canteen;

        const result = await cloudinary.uploader.upload(dataUrl, {
            folder: `rush-bites/${target}`,
            resource_type: "image",
            // cap the long edge so a phone photo doesn't ship 4000px to customers
            transformation: [
                { width: 1200, height: 1200, crop: "limit" },
                { quality: "auto", fetch_format: "auto" },
            ],
        });

        res.status(201).json({
            success: true,
            url: result.secure_url,
            publicId: result.public_id,
        });
    } catch (err) {
        console.error("Upload image error:", err.message);

        // Cloudinary rejects (bad credentials, quota, network) — the client
        // falls back to a local data URL, so a 502 is enough detail here.
        res.status(502).json({
            success: false,
            message: "Image upload failed — the image was kept locally.",
        });
    }
};
