import { v2 as cloudinary } from "cloudinary";
import "dotenv/config";

const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } =
    process.env;

/**
 * Cloudinary is optional at boot: the app must still run (storing images as
 * inline data URLs) on a machine with no credentials, so nothing here throws.
 * Callers check `cloudinaryConfigured` and tell the client to fall back.
 */
export const cloudinaryConfigured = Boolean(
    CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET,
);

if (cloudinaryConfigured) {
    cloudinary.config({
        cloud_name: CLOUDINARY_CLOUD_NAME,
        api_key: CLOUDINARY_API_KEY,
        api_secret: CLOUDINARY_API_SECRET,
        secure: true, // always hand back https:// URLs
    });
    console.log("CLOUDINARY configured — images will be CDN-hosted.");
} else {
    console.warn(
        "CLOUDINARY not configured — images fall back to inline data URLs. Add CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET to upload to the CDN.",
    );
}

export default cloudinary;
