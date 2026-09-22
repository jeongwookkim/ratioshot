package com.ratioshot.camera;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapRegionDecoder;
import android.graphics.Matrix;
import android.graphics.Rect;
import androidx.exifinterface.media.ExifInterface;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import org.json.JSONObject;

/**
 * Cuts ratio crops out of a captured JPEG natively. Rects are given in the *displayed* (EXIF-upright)
 * pixel space; they are mapped back onto the stored pixels so only the crop regions get decoded,
 * then rotated upright and written as JPEG files. Decoding and encoding 12MP in the web view's
 * canvas took seconds per crop; this takes a fraction of a second for all of them.
 */
@CapacitorPlugin(name = "RatioCrop")
public class RatioCropPlugin extends Plugin {

    @PluginMethod
    public void crop(PluginCall call) {
        String path = call.getString("path");
        int quality = call.getInt("quality", 90);
        JSArray crops = call.getArray("crops");
        if (path == null || crops == null) {
            call.reject("path and crops are required");
            return;
        }
        try {
            int orientation = new ExifInterface(path).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(path, bounds);
            int rawW = bounds.outWidth;
            int rawH = bounds.outHeight;
            BitmapRegionDecoder decoder = BitmapRegionDecoder.newInstance(path, false);

            File dir = new File(getContext().getCacheDir(), "ratioshot");
            dir.mkdirs();
            JSArray files = new JSArray();
            for (int i = 0; i < crops.length(); i++) {
                JSONObject c = crops.getJSONObject(i);
                int x = c.getInt("x");
                int y = c.getInt("y");
                int w = c.getInt("w");
                int h = c.getInt("h");
                Rect raw = toRaw(x, y, w, h, orientation, rawW, rawH);
                Bitmap region = decoder.decodeRegion(raw, new BitmapFactory.Options());
                Bitmap upright = upright(region, orientation);
                File out = new File(dir, c.getString("id").replace(":", "x") + "_" + System.currentTimeMillis() + ".jpg");
                try (FileOutputStream fos = new FileOutputStream(out)) {
                    upright.compress(Bitmap.CompressFormat.JPEG, quality, fos);
                }
                JSObject f = new JSObject();
                f.put("id", c.getString("id"));
                f.put("path", out.getAbsolutePath());
                f.put("width", upright.getWidth());
                f.put("height", upright.getHeight());
                files.put(f);
                if (upright != region) region.recycle();
                upright.recycle();
            }
            decoder.recycle();
            JSObject ret = new JSObject();
            ret.put("files", files);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("crop failed: " + e.getMessage());
        }
    }

    /** Map a rect in upright space to the stored (pre-rotation) pixel space. */
    private static Rect toRaw(int x, int y, int w, int h, int orientation, int rawW, int rawH) {
        switch (orientation) {
            case ExifInterface.ORIENTATION_ROTATE_90: // stored rotated 90° CW → upright = raw rotated 90°
                return clamp(new Rect(y, rawH - x - w, y + h, rawH - x), rawW, rawH);
            case ExifInterface.ORIENTATION_ROTATE_180:
                return clamp(new Rect(rawW - x - w, rawH - y - h, rawW - x, rawH - y), rawW, rawH);
            case ExifInterface.ORIENTATION_ROTATE_270:
                return clamp(new Rect(rawW - y - h, x, rawW - y, x + w), rawW, rawH);
            default:
                return clamp(new Rect(x, y, x + w, y + h), rawW, rawH);
        }
    }

    private static Rect clamp(Rect r, int w, int h) {
        r.left = Math.max(0, Math.min(r.left, w - 1));
        r.top = Math.max(0, Math.min(r.top, h - 1));
        r.right = Math.max(r.left + 1, Math.min(r.right, w));
        r.bottom = Math.max(r.top + 1, Math.min(r.bottom, h));
        return r;
    }

    private static Bitmap upright(Bitmap b, int orientation) {
        Matrix m = new Matrix();
        switch (orientation) {
            case ExifInterface.ORIENTATION_ROTATE_90: m.postRotate(90); break;
            case ExifInterface.ORIENTATION_ROTATE_180: m.postRotate(180); break;
            case ExifInterface.ORIENTATION_ROTATE_270: m.postRotate(270); break;
            default: return b;
        }
        return Bitmap.createBitmap(b, 0, 0, b.getWidth(), b.getHeight(), m, true);
    }
}
