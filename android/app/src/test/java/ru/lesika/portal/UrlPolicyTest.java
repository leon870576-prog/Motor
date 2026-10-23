package ru.lesika.portal;

import org.junit.Test;
import static org.junit.Assert.*;

public class UrlPolicyTest {
    private final UrlPolicy p = new UrlPolicy("https://motor-testing.up.railway.app/");
    @Test public void acceptsExactHttpsOrigin() {
        assertTrue(p.internal("https://motor-testing.up.railway.app/pages/userpage.php?uz=Tester"));
        assertTrue(p.internal("https://MOTOR-testing.up.railway.app:443/chat/index.php"));
    }
    @Test public void rejectsOriginAndSchemeConfusion() {
        for (String value : new String[]{null, "", "http://motor-testing.up.railway.app/", "https://motor-testing.up.railway.app.evil.test/", "https://evil.test/motor-testing.up.railway.app", "https://motor-testing.up.railway.app@evil.test/", "https://x@motor-testing.up.railway.app/", "https://motor-testing.up.railway.app:444/", "https://motor-testing.up.railway.app\\@evil.test/", "file:///etc/passwd", "content://test/data", "javascript:alert(1)", "intent://test", "https://motor-testing.up.railway.app/\n"}) assertFalse(value, p.internal(value));
    }
    @Test public void sharingStripsSecretsAndFragments() {
        assertEquals("https://motor-testing.up.railway.app/pages/userpage.php?uz=Tester&tab=news&post=123", p.shareUrl("https://motor-testing.up.railway.app/pages/userpage.php?SID=secret&uz=Tester&token=secret&tab=news&par=secret&post=123#secret"));
        assertEquals("https://motor-testing.up.railway.app/", p.shareUrl("https://evil.test/"));
        assertFalse(p.shareUrl("https://motor-testing.up.railway.app/?%53ID=secret&csrf=secret").contains("secret"));
    }
    @Test public void externalIntentsAreNarrow() {
        assertTrue(p.externalWeb("https://example.org/news"));
        assertTrue(p.phoneOrEmail("tel:+79990000000"));
        assertTrue(p.phoneOrEmail("mailto:help@example.org"));
        assertFalse(p.phoneOrEmail("intent://test/#Intent;scheme=tel;end"));
        assertFalse(p.externalWeb("https://user:password@example.org/"));
        assertFalse(p.externalWeb("file:///storage/test.html"));
    }
}
