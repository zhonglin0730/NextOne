package com.nextone.auth;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

@Component
public class CurrentUser {

    public SingleUserPrincipal get() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof SingleUserPrincipal principal)) {
            throw new IllegalStateException("Authenticated user is unavailable");
        }
        return principal;
    }

    public String id() {
        return get().id();
    }
}
