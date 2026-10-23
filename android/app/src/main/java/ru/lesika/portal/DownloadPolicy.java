package ru.lesika.portal;

import java.io.IOException;

/** Content-Length parsing without URLConnection.getContentLengthLong (API 24+). */
final class DownloadPolicy {
    private DownloadPolicy() { }

    static long contentLength(String header) throws IOException {
        if (header == null) return -1;
        String value = header.trim();
        if (value.isEmpty() || value.length() > 19) throw new IOException("Invalid content length");
        for (int i = 0; i < value.length(); i++)
            if (value.charAt(i) < '0' || value.charAt(i) > '9') throw new IOException("Invalid content length");
        try { return Long.parseLong(value); }
        catch (NumberFormatException ignored) { throw new IOException("Invalid content length"); }
    }
}
