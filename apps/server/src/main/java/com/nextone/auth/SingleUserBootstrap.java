package com.nextone.auth;

import java.time.Clock;
import java.time.OffsetDateTime;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(
        prefix = "nextone.bootstrap",
        name = "enabled",
        havingValue = "true",
        matchIfMissing = true
)
public class SingleUserBootstrap implements ApplicationRunner {

    private final JdbcTemplate jdbcTemplate;
    private final SingleUserProperties properties;
    private final Clock clock;

    public SingleUserBootstrap(
            JdbcTemplate jdbcTemplate,
            SingleUserProperties properties,
            Clock clock
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.properties = properties;
        this.clock = clock;
    }

    @Override
    public void run(ApplicationArguments args) {
        OffsetDateTime now = OffsetDateTime.now(clock);
        jdbcTemplate.update("""
                INSERT INTO app_user (
                    id, display_name, locale, time_zone, created_at, updated_at, revision
                ) VALUES (?, ?, ?, ?, ?, ?, 1)
                ON CONFLICT (id) DO UPDATE SET
                    display_name = EXCLUDED.display_name,
                    locale = EXCLUDED.locale,
                    time_zone = EXCLUDED.time_zone,
                    updated_at = EXCLUDED.updated_at
                """,
                properties.id(),
                properties.displayName(),
                properties.locale(),
                properties.timeZone(),
                now,
                now
        );
    }
}
