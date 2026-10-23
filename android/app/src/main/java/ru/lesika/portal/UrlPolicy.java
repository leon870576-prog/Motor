package ru.lesika.portal;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** One strict origin for WebView, credentials and authenticated downloads. */
public final class UrlPolicy {
    private final URI base;
    private static final Set<String> SHARE_KEYS = new HashSet<>(Arrays.asList("action", "id", "gid", "uz", "tab", "post", "page", "fid", "tid", "p", "f", "view"));

    public UrlPolicy(String baseUrl) {
        base = parse(baseUrl);
        if (base == null || !"https".equalsIgnoreCase(base.getScheme()) || base.getHost() == null
                || base.getUserInfo() != null || (base.getPort() != -1 && base.getPort() != 443)) {
            throw new IllegalArgumentException("An HTTPS origin is required");
        }
    }

    private static URI parse(String value) {
        if (value == null || value.length() > 8192 || value.indexOf('\\') >= 0) return null;
        for (int i = 0; i < value.length(); i++) if (Character.isISOControl(value.charAt(i)) || Character.isWhitespace(value.charAt(i))) return null;
        try { return new URI(value); } catch (Exception ignored) { return null; }
    }

    public boolean internal(String value) {
        URI u = parse(value);
        return u != null && "https".equalsIgnoreCase(u.getScheme()) && u.getUserInfo() == null
                && base.getHost().equalsIgnoreCase(u.getHost()) && (u.getPort() == -1 || u.getPort() == 443);
    }

    public boolean externalWeb(String value) {
        URI u = parse(value);
        return u != null && u.getHost() != null && u.getUserInfo() == null
                && ("https".equalsIgnoreCase(u.getScheme()) || "http".equalsIgnoreCase(u.getScheme()));
    }

    public boolean phoneOrEmail(String value) {
        URI u = parse(value);
        return u != null && ("tel".equalsIgnoreCase(u.getScheme()) || "mailto".equalsIgnoreCase(u.getScheme()));
    }

    public String host() { return base.getHost(); }

    /** Share only content identifiers; session IDs and authentication data never leave the app. */
    public String shareUrl(String value) {
        if (!internal(value)) return base.toString();
        URI u = parse(value);
        List<String> pairs = new ArrayList<>();
        if (u.getRawQuery() != null) for (String pair : u.getRawQuery().split("&")) {
            int equals = pair.indexOf('=');
            String key = equals >= 0 ? pair.substring(0, equals) : pair;
            try {
                key = URLDecoder.decode(key, StandardCharsets.UTF_8.name());
                if (SHARE_KEYS.contains(key)) pairs.add(pair);
            } catch (Exception ignored) { /* Omit malformed fields. */ }
        }
        String path = u.getRawPath();
        StringBuilder query = new StringBuilder();
        for (String pair : pairs) query.append(query.length() == 0 ? '?' : '&').append(pair);
        return "https://" + base.getHost() + (path == null || path.isEmpty() ? "/" : path)
                + query;
    }
}
