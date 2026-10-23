package ru.lesika.portal;

import java.io.IOException;
import org.junit.Test;
import static org.junit.Assert.*;

public class DownloadPolicyTest {
    @Test public void acceptsAbsentAndValidLengthsWithoutIntegerOverflow() throws Exception {
        assertEquals(-1, DownloadPolicy.contentLength(null));
        assertEquals(0, DownloadPolicy.contentLength("0"));
        assertEquals(128L * 1024 * 1024, DownloadPolicy.contentLength("134217728"));
        assertEquals(2147483648L, DownloadPolicy.contentLength(" 2147483648 "));
        assertEquals(Long.MAX_VALUE, DownloadPolicy.contentLength("9223372036854775807"));
    }
    @Test public void rejectsMalformedNegativeAndOverflowLengths() throws Exception {
        for (String value : new String[]{"", " ", "-1", "+1", "1, 1", "1.5", "abc", "9223372036854775808", "99999999999999999999"}) {
            try { DownloadPolicy.contentLength(value); fail(value); }
            catch (IOException expected) { }
        }
    }
}
