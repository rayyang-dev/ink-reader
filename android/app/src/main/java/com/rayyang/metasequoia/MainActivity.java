package com.rayyang.metasequoia;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient.FileChooserParams;
import android.net.Uri;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.os.Bundle;
import android.view.WindowManager;
import android.widget.Toast;

import java.util.ArrayList;

public class MainActivity extends BridgeActivity {
    private static final int FILECHOOSER_REQ = 1001;
    private ValueCallback<Uri[]> uploadCallback;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 在 Capacitor 完成 WebView 初始化后，替换其 WebChromeClient 为“仅重写文件选择”的子类，
        // 其余（桥接 / 权限 / 全屏视频 / JS 弹窗 / 控制台等）全部沿用 Capacitor 原生实现。
        installFileChooserClient();
    }

    private void installFileChooserClient() {
        Bridge bridge = getBridge();
        if (bridge == null) return;
        WebView wv = bridge.getWebView();
        if (wv == null) return;
        wv.setWebChromeClient(new FileChooserClient(bridge, this));
        // 暴露原生接口给 JS：阅读器内保持屏幕常亮（FLAG_KEEP_SCREEN_ON），离开阅读器时恢复
        wv.addJavascriptInterface(new ScreenOnBridge(this), "AndroidScreenOn");
    }

    // 仅重写 onShowFileChooser；其它所有回调继承 BridgeWebChromeClient，保证不破坏 Capacitor 桥接。
    private static class FileChooserClient extends BridgeWebChromeClient {
        private final MainActivity host;
        FileChooserClient(Bridge bridge, MainActivity host) {
            super(bridge);
            this.host = host;
        }
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> filePathCallback, FileChooserParams params) {
            return host.showFileChooser(filePathCallback, params);
        }
    }

    boolean showFileChooser(ValueCallback<Uri[]> cb, FileChooserParams params) {
        uploadCallback = cb;
        // 优先用 SAF 的 ACTION_OPEN_DOCUMENT（openable），兼容性最好；失败再退回 ACTION_GET_CONTENT。
        Intent intent = buildIntent(params, Intent.ACTION_OPEN_DOCUMENT);
        try {
            startActivityForResult(intent, FILECHOOSER_REQ);
            return true;
        } catch (ActivityNotFoundException e1) {
            Intent fallback = buildIntent(params, Intent.ACTION_GET_CONTENT);
            try {
                startActivityForResult(fallback, FILECHOOSER_REQ);
                return true;
            } catch (ActivityNotFoundException e2) {
                Toast.makeText(this, "无法打开系统文件选择器：请确认设备已安装文件管理器", Toast.LENGTH_LONG).show();
                if (uploadCallback != null) {
                    uploadCallback.onReceiveValue(null);
                    uploadCallback = null;
                }
                return false;
            }
        }
    }

    private Intent buildIntent(FileChooserParams params, String action) {
        Intent intent = new Intent(action);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        String[] mimes = filterMimes(params);
        if (mimes != null) {
            intent.putExtra(Intent.EXTRA_MIME_TYPES, mimes);
        }
        return intent;
    }

    // 仅保留形如 "text/plain" 的真实 MIME（过滤 ".txt" 这类扩展名与 "*/*"），避免 Intent 匹配不到任何应用。
    private String[] filterMimes(FileChooserParams params) {
        try {
            String[] raw = params.getAcceptTypes();
            if (raw == null || raw.length == 0) return null;
            ArrayList<String> list = new ArrayList<>();
            for (String t : raw) {
                if (t != null && t.contains("/") && !"*/*".equals(t)) list.add(t);
            }
            return list.isEmpty() ? null : list.toArray(new String[0]);
        } catch (Throwable ignore) {
            return null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        // 先交给 Capacitor 处理它自己的结果（插件 / 权限等），再处理文件选择。
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILECHOOSER_REQ) {
            if (uploadCallback == null) return;
            Uri[] results = FileChooserParams.parseResult(resultCode, data);
            uploadCallback.onReceiveValue(results);
            uploadCallback = null;
        }
    }

    // JS 可调用的原生桥：控制屏幕常亮。仅阅读器激活时由 JS 开启，离开阅读器时关闭，
    // 避免书架 / 设置页也常亮费电。FLAG_KEEP_SCREEN_ON 由系统负责在 Activity 不可见时自动忽略。
    private static class ScreenOnBridge {
        private final MainActivity host;
        ScreenOnBridge(MainActivity h) { host = h; }
        @JavascriptInterface
        public void setKeepScreenOn(boolean on) {
            host.runOnUiThread(() -> {
                if (on) host.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else host.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }
    }
}
