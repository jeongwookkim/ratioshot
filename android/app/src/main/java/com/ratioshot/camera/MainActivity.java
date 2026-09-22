package com.ratioshot.camera;

import android.os.Bundle;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RatioCropPlugin.class);
        super.onCreate(savedInstanceState);
        // The AdMob banner is anchored one system-bar inset above the bottom of the web view's parent,
        // whether or not Capacitor already padded the web view for that bar. Hand the real inset to
        // CSS so the layout can reserve exactly the space the banner occupies (see styles.css).
        float density = getResources().getDisplayMetrics().density;
        ViewCompat.setOnApplyWindowInsetsListener(getWindow().getDecorView(), (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            int bottomDp = Math.round(bars.bottom / density);
            int topDp = Math.round(bars.top / density);
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().evaluateJavascript(
                    "document.documentElement && document.documentElement.style.setProperty('--sys-inset-bottom','" + bottomDp + "px');" +
                    "document.documentElement && document.documentElement.style.setProperty('--sys-inset-top','" + topDp + "px');",
                    null
                );
            }
            return insets;
        });
    }
}
