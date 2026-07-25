package com.nextone.auth;

public record SingleUserPrincipal(
        String id,
        String displayName,
        String locale,
        String timeZone
) {
}
