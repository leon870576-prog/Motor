package ru.lesika.portal;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.provider.DocumentsContract;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.HttpAuthHandler;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.SslErrorHandler;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Small Android shell. Website owns accounts, permissions, content and configurable bottom menu. */
public final class MainActivity extends Activity {
    private static final int PICK_FILE = 301, SAVE_FILE = 302;
    private static final int INK = Color.rgb(49, 57, 48), ACCENT = Color.rgb(140, 73, 44);
    private static final int PAPER = Color.rgb(255, 249, 241);
    private final UrlPolicy policy = new UrlPolicy(BuildConfig.SITE_URL);
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private WebView web;
    private FrameLayout content;
    private LinearLayout root, errorBox;
    private ProgressBar progress;
    private TextView errorTitle, errorMessage;
    private ValueCallback<Uri[]> fileCallback;
    private boolean multipleFiles;
    private String lastUrl = BuildConfig.SITE_URL;
    private String authHeader; // Memory only, never written to preferences, logs, APK or saved state.
    private AlertDialog authDialog, downloadDialog;
    private HttpAuthHandler pendingAuth;
    private PendingDownload pendingDownload;
    private volatile HttpURLConnection activeDownload;
    private volatile boolean cancelDownload;
    private View fullScreenVideo;
    private WebChromeClient.CustomViewCallback videoCallback;
    private boolean mainFailed;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(0, this::goBack);
        buildUi();
        createWebView();
        String restored = state == null ? null : state.getString("page");
        navigate(policy.internal(restored) ? restored : BuildConfig.SITE_URL);
    }

    private int dp(float value) { return Math.round(getResources().getDisplayMetrics().density * value); }
    private TextView text(String value, int size) {
        TextView t = new TextView(this); t.setText(value); t.setTextSize(size); t.setTextColor(INK); return t;
    }
    private Button action(String label, String description, View.OnClickListener listener) {
        Button b = new Button(this); b.setText(label); b.setTextColor(ACCENT); b.setTextSize(18);
        b.setAllCaps(false); b.setMinWidth(0); b.setMinimumWidth(0); b.setMinHeight(dp(48));
        b.setPadding(0, 0, 0, 0); b.setContentDescription(description);
        b.setBackgroundTintList(ColorStateList.valueOf(PAPER)); b.setOnClickListener(listener); return b;
    }

    private void buildUi() {
        root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(PAPER);
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int left, top, right, bottom;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                left = bars.left; top = bars.top; right = bars.right; bottom = Math.max(bars.bottom, ime.bottom);
            } else {
                left = insets.getSystemWindowInsetLeft(); top = insets.getSystemWindowInsetTop();
                right = insets.getSystemWindowInsetRight(); bottom = insets.getSystemWindowInsetBottom();
            }
            v.setPadding(left, top, right, bottom); return insets;
        });
        LinearLayout toolbar = new LinearLayout(this); toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.addView(action("☰", "Разделы сайта", v -> showSections()), new LinearLayout.LayoutParams(dp(48), dp(52)));
        LinearLayout heading = new LinearLayout(this); heading.setOrientation(LinearLayout.VERTICAL);
        TextView title = text(getString(R.string.app_name), 18); title.setTypeface(null, android.graphics.Typeface.BOLD);
        TextView subtitle = text(getString(R.string.site_title), 11); subtitle.setSingleLine(true);
        heading.addView(title); heading.addView(subtitle); heading.setContentDescription("Лесика. На главную");
        heading.setOnClickListener(v -> navigate(BuildConfig.SITE_URL));
        toolbar.addView(heading, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        toolbar.addView(action("↻", "Обновить страницу", v -> reload()), new LinearLayout.LayoutParams(dp(48), dp(52)));
        toolbar.addView(action("⋮", "Действия приложения", this::showMenu), new LinearLayout.LayoutParams(dp(48), dp(52)));
        root.addView(toolbar);
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setProgressTintList(ColorStateList.valueOf(ACCENT)); progress.setMax(100);
        root.addView(progress, new LinearLayout.LayoutParams(-1, dp(2)));
        content = new FrameLayout(this); root.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));
        errorBox = new LinearLayout(this); errorBox.setOrientation(LinearLayout.VERTICAL);
        errorBox.setGravity(Gravity.CENTER); errorBox.setPadding(dp(28), dp(20), dp(28), dp(20)); errorBox.setBackgroundColor(PAPER);
        errorTitle = text("Не удалось открыть страницу", 22); errorTitle.setGravity(Gravity.CENTER);
        errorMessage = text("Проверьте соединение и попробуйте снова.", 16); errorMessage.setGravity(Gravity.CENTER);
        errorMessage.setPadding(0, dp(16), 0, dp(24));
        errorBox.addView(errorTitle); errorBox.addView(errorMessage);
        errorBox.addView(action("Попробовать снова", "Повторить загрузку", v -> navigate(lastUrl)), new LinearLayout.LayoutParams(-1, dp(56)));
        errorBox.addView(action("На главную", "Открыть главную страницу", v -> navigate(BuildConfig.SITE_URL)), new LinearLayout.LayoutParams(-1, dp(56)));
        errorBox.setVisibility(View.GONE); content.addView(errorBox, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void createWebView() {
        web = new WebView(this); web.setBackgroundColor(PAPER);
        content.addView(web, 0, new FrameLayout.LayoutParams(-1, -1));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false); s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(false); s.setAllowUniversalAccessFromFileURLs(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW); s.setSafeBrowsingEnabled(true);
        s.setJavaScriptCanOpenWindowsAutomatically(false); s.setSupportMultipleWindows(true);
        s.setMediaPlaybackRequiresUserGesture(true); s.setGeolocationEnabled(false);
        s.setUseWideViewPort(true); s.setLoadWithOverviewMode(true);
        s.setBuiltInZoomControls(true); s.setDisplayZoomControls(false);
        s.setUserAgentString(s.getUserAgentString() + " LesikaAndroid/" + BuildConfig.VERSION_NAME);
        CookieManager.getInstance().setAcceptCookie(true); CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        WebView.setWebContentsDebuggingEnabled(false);
        web.setWebViewClient(new SiteClient()); web.setWebChromeClient(new SiteChrome());
        web.setDownloadListener((url, agent, disposition, mime, length) -> askSave(url, disposition, mime));
    }

    private void navigate(String url) {
        if (!policy.internal(url)) return;
        if (web == null) createWebView();
        lastUrl = url; mainFailed = false; errorBox.setVisibility(View.GONE); web.setVisibility(View.VISIBLE); web.loadUrl(url);
    }
    private void reload() {
        if (web == null || mainFailed) navigate(lastUrl);
        else web.reload(); // POST reload is separately confirmed in onFormResubmission.
    }
    private void showError(String title, String message) {
        mainFailed = true; progress.setVisibility(View.INVISIBLE); errorTitle.setText(title); errorMessage.setText(message);
        errorBox.setVisibility(View.VISIBLE); if (web != null) web.setVisibility(View.INVISIBLE);
    }
    private void openExternal(String url) {
        if (!policy.externalWeb(url) && !policy.phoneOrEmail(url)) { toast("Эта ссылка не поддерживается"); return; }
        try {
            Intent i = new Intent(url.startsWith("tel:") ? Intent.ACTION_DIAL : Intent.ACTION_VIEW, Uri.parse(url));
            i.addCategory(Intent.CATEGORY_BROWSABLE); startActivity(i);
        } catch (ActivityNotFoundException e) { toast("Нет приложения для этой ссылки"); }
    }
    private void toast(String message) { Toast.makeText(this, message, Toast.LENGTH_LONG).show(); }

    private final class SiteClient extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            String url = request.getUrl().toString();
            if (!request.isForMainFrame()) return !policy.internal(url);
            if (policy.internal(url)) return false;
            if (request.hasGesture()) openExternal(url);
            return true;
        }
        @Override public void onPageStarted(WebView v, String url, android.graphics.Bitmap icon) {
            if (!policy.internal(url)) { v.stopLoading(); return; }
            lastUrl = url; mainFailed = false; errorBox.setVisibility(View.GONE); v.setVisibility(View.VISIBLE); progress.setVisibility(View.VISIBLE);
        }
        @Override public void onPageFinished(WebView v, String url) {
            CookieManager.getInstance().flush(); progress.setVisibility(View.INVISIBLE);
        }
        @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
            if (r.isForMainFrame()) showError("Нет соединения с сайтом", "Проверьте интернет и нажмите «Попробовать снова». Несохранённую запись потребуется проверить перед повторной отправкой.");
        }
        @Override public void onReceivedHttpError(WebView v, WebResourceRequest r, WebResourceResponse response) {
            if (r.isForMainFrame() && response.getStatusCode() >= 500) showError("Сайт временно недоступен", "Попробуйте открыть страницу немного позже.");
        }
        @Override public void onReceivedSslError(WebView v, SslErrorHandler handler, SslError error) {
            handler.cancel();
            if (policy.internal(error.getUrl())) showError("Защищённое соединение не установлено", "Проверьте дату на телефоне. Если ошибка повторяется, потребуется проверить сертификат сайта.");
        }
        @Override public void onReceivedHttpAuthRequest(WebView v, HttpAuthHandler handler, String host, String realm) {
            if (!policy.host().equalsIgnoreCase(host) || !policy.internal(lastUrl)) { handler.cancel(); return; }
            showAuth(handler);
        }
        @Override public void onFormResubmission(WebView view, Message dontResend, Message resend) {
            new AlertDialog.Builder(MainActivity.this).setTitle("Повторить отправку?")
                    .setMessage("Это может повторно отправить данные формы. Если запись уже сохранена, выберите «Отмена».")
                    .setPositiveButton("Повторить", (d, w) -> resend.sendToTarget())
                    .setNegativeButton("Отмена", (d, w) -> dontResend.sendToTarget())
                    .setOnCancelListener(d -> dontResend.sendToTarget()).show();
        }
        @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            content.removeView(view); view.destroy(); web = null;
            showError("Страница была закрыта системой", "Нажмите «Попробовать снова», чтобы открыть её заново."); return true;
        }
    }

    private final class SiteChrome extends WebChromeClient {
        @Override public void onProgressChanged(WebView v, int value) { progress.setProgress(value); }
        @Override public void onPermissionRequest(PermissionRequest request) { request.deny(); }
        @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback; multipleFiles = params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE;
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT); intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("*/*"); intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multipleFiles);
            List<String> types = new ArrayList<>();
            for (String type : params.getAcceptTypes()) if (type != null) for (String t : type.split(",")) {
                t = t.trim(); if (t.matches("[A-Za-z0-9.+-]+/[A-Za-z0-9.*+-]+")) types.add(t);
            }
            if (!types.isEmpty()) intent.putExtra(Intent.EXTRA_MIME_TYPES, types.toArray(new String[0]));
            try { startActivityForResult(intent, PICK_FILE); }
            catch (ActivityNotFoundException e) { fileCallback.onReceiveValue(null); fileCallback = null; toast("Не удалось открыть выбор файлов"); }
            return true;
        }
        @Override public boolean onCreateWindow(WebView view, boolean dialog, boolean userGesture, Message result) {
            if (!userGesture) return false;
            WebView popup = new WebView(MainActivity.this);
            popup.getSettings().setAllowFileAccess(false);
            popup.getSettings().setAllowContentAccess(false);
            popup.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            popup.postDelayed(popup::destroy, 30000);
            popup.setWebViewClient(new WebViewClient() {
                private boolean handled;
                private boolean route(String url) {
                    if (handled) return true; handled = true;
                    if (policy.internal(url)) navigate(url); else openExternal(url);
                    popup.post(popup::destroy); return true;
                }
                @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return route(r.getUrl().toString()); }
                @Override public void onPageStarted(WebView v, String url, android.graphics.Bitmap icon) {
                    v.stopLoading(); if (!"about:blank".equals(url)) route(url);
                }
            });
            ((WebView.WebViewTransport) result.obj).setWebView(popup); result.sendToTarget(); return true;
        }
        @Override public void onShowCustomView(View view, CustomViewCallback callback) {
            if (fullScreenVideo != null) { callback.onCustomViewHidden(); return; }
            fullScreenVideo = view; videoCallback = callback;
            ((ViewGroup) getWindow().getDecorView()).addView(view, new ViewGroup.LayoutParams(-1, -1));
        }
        @Override public void onHideCustomView() { hideVideo(); }
    }

    private void showAuth(HttpAuthHandler handler) {
        if (pendingAuth != null) { handler.cancel(); return; }
        authHeader = null; pendingAuth = handler;
        LinearLayout box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setPadding(dp(24), dp(8), dp(24), 0);
        TextView explanation = text("Сайт пока закрыт тестовым доступом. Введите логин и пароль доступа к сайту. После этого можно войти в свой профиль.", 15); box.addView(explanation);
        EditText username = new EditText(this); username.setHint("Логин тестового доступа"); username.setSingleLine();
        username.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD);
        EditText password = new EditText(this); password.setHint("Пароль тестового доступа"); password.setSingleLine();
        password.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        username.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO); password.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO);
        box.addView(username); box.addView(password);
        authDialog = new AlertDialog.Builder(this).setTitle("Доступ к сайту").setView(box)
                .setPositiveButton("Продолжить", null).setNegativeButton("Отмена", (d, w) -> cancelAuth())
                .setOnCancelListener(d -> cancelAuth()).create();
        authDialog.setOnShowListener(d -> authDialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            String u = username.getText().toString().trim(), p = password.getText().toString();
            if (!u.matches("[A-Za-z0-9_-]{1,40}") || p.isEmpty() || p.contains("\n") || p.contains("\r")) { password.setError("Проверьте логин и пароль"); return; }
            authHeader = "Basic " + android.util.Base64.encodeToString((u + ":" + p).getBytes(StandardCharsets.UTF_8), android.util.Base64.NO_WRAP);
            HttpAuthHandler current = pendingAuth; pendingAuth = null;
            password.setText(""); authDialog.dismiss(); authDialog = null;
            if (current != null) current.proceed(u, p);
        }));
        authDialog.show();
    }
    private void cancelAuth() {
        if (pendingAuth != null) pendingAuth.cancel(); pendingAuth = null; authHeader = null;
        showError("Для сайта нужен тестовый доступ", "Откройте сайт с логином и паролем тестового доступа. Они не встроены в приложение.");
    }

    private void showSections() {
        String[] names = {"Главная", "Новости", "Объявления", "Форум", "Чат", "Личные сообщения", "Моя страница", "Фотогалерея", "Гостевая", "Темы оформления"};
        String[] paths = {"", "news/index.php", "board/index.php", "forum/index.php", "chat/index.php", "pages/privat.php", "pages/userpage.php", "gallery/index.php", "book/index.php", "pages/themes.php"};
        new AlertDialog.Builder(this).setTitle("Разделы Лесики").setItems(names, (d, which) -> navigate(BuildConfig.SITE_URL + paths[which])).show();
    }
    private void showMenu(View anchor) {
        PopupMenu menu = new PopupMenu(this, anchor);
        menu.getMenu().add(0, 1, 0, "Назад"); menu.getMenu().add(0, 2, 1, "Поделиться ссылкой");
        menu.getMenu().add(0, 3, 2, "Открыть в браузере"); menu.getMenu().add(0, 4, 3, "Сбросить вход в приложении");
        menu.getMenu().add(0, 5, 4, "О приложении");
        menu.setOnMenuItemClickListener(item -> {
            switch (item.getItemId()) {
                case 1: goBack(); break;
                case 2:
                    Intent share = new Intent(Intent.ACTION_SEND); share.setType("text/plain");
                    share.putExtra(Intent.EXTRA_TEXT, policy.shareUrl(lastUrl)); startActivity(Intent.createChooser(share, "Поделиться")); break;
                case 3: openExternal(policy.shareUrl(lastUrl)); break;
                case 4: confirmClear(); break;
                case 5: new AlertDialog.Builder(this).setTitle("Лесика " + BuildConfig.VERSION_NAME)
                        .setMessage("Лесозаводск онлайн\n\nПриложение использует общие данные сайта.\n\nЭто первая тестовая версия. Push-уведомления пока не подключены.")
                        .setPositiveButton("Понятно", null).show(); break;
                default: return false;
            }
            return true;
        }); menu.show();
    }
    private void confirmClear() {
        new AlertDialog.Builder(this).setTitle("Сбросить вход на этом телефоне?")
                .setMessage("Будут удалены локальные данные входа и кэш приложения. Профиль и записи на сайте сохранятся.")
                .setPositiveButton("Сбросить", (d, w) -> {
                    stopDownload();
                    if (web != null) web.stopLoading();
                    authHeader = null; android.webkit.WebStorage.getInstance().deleteAllData();
                    android.webkit.WebViewDatabase.getInstance(this).clearHttpAuthUsernamePassword();
                    CookieManager.getInstance().removeAllCookies(value -> {
                        CookieManager.getInstance().flush();
                        if (web != null) { content.removeView(web); web.clearCache(true); web.destroy(); web = null; }
                        navigate(BuildConfig.SITE_URL);
                    });
                }).setNegativeButton("Отмена", null).show();
    }

    private static final class PendingDownload {
        final String url, mime, cookie, authorization;
        PendingDownload(String u, String m, String c, String a) { url=u; mime=m; cookie=c; authorization=a; }
    }
    private void askSave(String url, String disposition, String mime) {
        if (!policy.internal(url)) { toast("Скачивание доступно только с сайта Лесики"); return; }
        if (pendingDownload != null || activeDownload != null || downloadDialog != null) { toast("Дождитесь завершения текущего сохранения"); return; }
        String safeMime = mime != null && mime.matches("[A-Za-z0-9.+-]+/[A-Za-z0-9.+-]+") ? mime : "application/octet-stream";
        String name = URLUtil.guessFileName(url, disposition, safeMime).replaceAll("[\\\\/\\p{Cntrl}]", "_");
        if (name.length() > 150) name = name.substring(name.length() - 150);
        pendingDownload = new PendingDownload(url, safeMime, CookieManager.getInstance().getCookie(url), authHeader);
        Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT); save.addCategory(Intent.CATEGORY_OPENABLE);
        save.setType(safeMime); save.putExtra(Intent.EXTRA_TITLE, name);
        try { startActivityForResult(save, SAVE_FILE); }
        catch (ActivityNotFoundException e) { pendingDownload = null; toast("Не удалось открыть сохранение файла"); }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PICK_FILE && fileCallback != null) {
            List<Uri> chosen = new ArrayList<>();
            if (result == RESULT_OK && data != null) {
                ClipData clips = data.getClipData();
                if (clips != null) for (int i=0; i < Math.min(clips.getItemCount(), multipleFiles ? 20 : 1); i++) addChosen(chosen, clips.getItemAt(i).getUri());
                else addChosen(chosen, data.getData());
            }
            fileCallback.onReceiveValue(chosen.isEmpty() ? null : chosen.toArray(new Uri[0])); fileCallback = null;
        } else if (request == SAVE_FILE) {
            PendingDownload download = pendingDownload; pendingDownload = null;
            if (download != null && result == RESULT_OK && data != null && validDocument(data.getData())) download(download, data.getData());
        }
    }
    private boolean validDocument(Uri uri) {
        return uri != null && "content".equals(uri.getScheme()) && uri.getAuthority() != null && !uri.getAuthority().startsWith(getPackageName());
    }
    private void addChosen(List<Uri> list, Uri uri) { if (validDocument(uri) && !list.contains(uri)) list.add(uri); }

    private void download(PendingDownload d, Uri destination) {
        cancelDownload = false;
        downloadDialog = new AlertDialog.Builder(this).setTitle("Сохранение файла")
                .setMessage("Файл сохраняется в выбранную папку…")
                .setNegativeButton("Отмена", (dialog, w) -> stopDownload()).setOnCancelListener(dialog -> stopDownload()).show();
        worker.execute(() -> {
            boolean success = false; String error = "Не удалось сохранить файл. Проверьте соединение и доступ к сайту.";
            try {
                String current = d.url;
                for (int redirects=0; redirects<4; redirects++) {
                    if (cancelDownload || !policy.internal(current)) throw new java.io.IOException("Rejected URL");
                    HttpURLConnection c = (HttpURLConnection) new URL(current).openConnection(); activeDownload = c;
                    c.setInstanceFollowRedirects(false); c.setConnectTimeout(15000); c.setReadTimeout(20000);
                    c.setRequestProperty("User-Agent", "LesikaAndroid/" + BuildConfig.VERSION_NAME);
                    c.setRequestProperty("Accept-Encoding", "identity");
                    if (d.cookie != null) c.setRequestProperty("Cookie", d.cookie);
                    if (d.authorization != null) c.setRequestProperty("Authorization", d.authorization);
                    int code = c.getResponseCode();
                    if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
                        String location = c.getHeaderField("Location");
                        if (location == null) throw new java.io.IOException("No location");
                        String next = new URL(new URL(current), location).toString(); c.disconnect(); activeDownload=null;
                        if (!policy.internal(next)) throw new java.io.IOException("Cross-origin redirect");
                        current = next; continue;
                    }
                    if (code != 200 || c.getContentLengthLong() > 128L*1024*1024) throw new java.io.IOException("Rejected response");
                    String actual = c.getContentType();
                    if (actual != null && actual.toLowerCase(java.util.Locale.ROOT).startsWith("text/html") && !"text/html".equals(d.mime)) throw new java.io.IOException("Login page");
                    try (InputStream input = c.getInputStream(); OutputStream output = getContentResolver().openOutputStream(destination, "wt")) {
                        if (output == null) throw new java.io.IOException("No output");
                        byte[] buffer = new byte[32768]; long total=0; int size;
                        while ((size=input.read(buffer)) != -1) {
                            total += size;
                            if (cancelDownload || total > 128L*1024*1024) throw new java.io.IOException("Cancelled or too large");
                            output.write(buffer, 0, size);
                        }
                        long expected = c.getContentLengthLong();
                        if (expected >= 0 && total != expected) throw new java.io.IOException("Incomplete response");
                        output.flush();
                    }
                    success = !cancelDownload;
                    break;
                }
            } catch (Exception ignored) { /* Do not log URLs, cookies, tokens or server response bodies. */ }
            finally {
                if (activeDownload != null) { activeDownload.disconnect(); activeDownload = null; }
                if (!success) try { DocumentsContract.deleteDocument(getContentResolver(), destination); } catch (Exception ignored) { }
            }
            final boolean saved=success;
            runOnUiThread(() -> {
                if (downloadDialog != null) { downloadDialog.dismiss(); downloadDialog=null; }
                if (!isDestroyed()) toast(saved ? "Файл сохранён" : (cancelDownload ? "Сохранение отменено" : error));
            });
        });
    }
    private void stopDownload() {
        cancelDownload = true;
        HttpURLConnection connection = activeDownload;
        if (connection != null) connection.disconnect();
    }
    private void hideVideo() {
        if (fullScreenVideo != null) {
            ((ViewGroup) fullScreenVideo.getParent()).removeView(fullScreenVideo); fullScreenVideo=null;
            if (videoCallback != null) videoCallback.onCustomViewHidden(); videoCallback=null;
        }
    }
    private void goBack() {
        if (fullScreenVideo != null) hideVideo();
        else if (web != null && web.canGoBack()) { errorBox.setVisibility(View.GONE); web.setVisibility(View.VISIBLE); web.goBack(); }
        else moveTaskToBack(true);
    }
    // API 33+ uses the platform OnBackInvokedDispatcher registered in onCreate.
    // This override supplies the same behavior only to legacy Android 26–32.
    @SuppressLint("GestureBackNavigation")
    @SuppressWarnings("deprecation") @Override public void onBackPressed() { goBack(); }
    @Override protected void onSaveInstanceState(Bundle state) { state.putString("page", policy.shareUrl(lastUrl)); super.onSaveInstanceState(state); }
    @Override protected void onPause() { if (web != null) web.onPause(); CookieManager.getInstance().flush(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }
    @Override protected void onDestroy() {
        if (fileCallback != null) { fileCallback.onReceiveValue(null); fileCallback=null; }
        if (pendingAuth != null) { pendingAuth.cancel(); pendingAuth=null; }
        if (authDialog != null) authDialog.dismiss();
        stopDownload(); worker.shutdownNow(); if (downloadDialog != null) downloadDialog.dismiss();
        authHeader=null; pendingDownload=null; hideVideo();
        if (web != null) { content.removeView(web); web.destroy(); web=null; }
        super.onDestroy();
    }
}
