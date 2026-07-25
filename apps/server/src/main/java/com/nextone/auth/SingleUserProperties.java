package com.nextone.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "nextone.single-user")
public record SingleUserProperties(
        String id,
        String displayName,
        String token,
        String locale,
        String timeZone
) {
}
