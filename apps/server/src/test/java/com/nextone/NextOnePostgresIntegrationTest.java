package com.nextone;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "nextone.single-user.token=test-access-token"
)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class NextOnePostgresIntegrationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:17-alpine");

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @LocalServerPort
    int port;

    @Autowired
    JdbcTemplate jdbcTemplate;

    @Autowired
    JsonMapper jsonMapper;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    @Test
    @Order(1)
    void migratesAnEmptyDatabaseAndRequiresAuthentication() throws Exception {
        Integer migrationCount = jdbcTemplate.queryForObject("""
                SELECT count(*)
                FROM flyway_schema_history
                WHERE success = true AND version IN ('1', '2', '3', '4', '5')
                """, Integer.class);
        assertThat(migrationCount).isEqualTo(5);

        HttpResponse<String> response = send("GET", "/api/v1/me", null, null);
        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(jsonMapper.readTree(response.body()).get("code").asString())
                .isEqualTo("AUTH_REQUIRED");

        HttpResponse<String> openApi = send(
                "GET",
                "/openapi/nextone-v1.yaml",
                null,
                null
        );
        assertThat(openApi.statusCode()).isEqualTo(200);
        assertThat(openApi.body()).contains("openapi: 3.1.0");
    }

    @Test
    @Order(2)
    void documentsEveryApplicationTableAndColumn() {
        List<String> undocumentedTables = jdbcTemplate.queryForList("""
                SELECT table_class.relname
                FROM pg_catalog.pg_class table_class
                JOIN pg_catalog.pg_namespace table_namespace
                  ON table_namespace.oid = table_class.relnamespace
                WHERE table_namespace.nspname = 'public'
                  AND table_class.relkind = 'r'
                  AND obj_description(table_class.oid, 'pg_class') IS NULL
                ORDER BY table_class.relname
                """, String.class);
        assertThat(undocumentedTables).isEmpty();

        List<String> undocumentedColumns = jdbcTemplate.queryForList("""
                SELECT table_class.relname || '.' || table_attribute.attname
                FROM pg_catalog.pg_class table_class
                JOIN pg_catalog.pg_namespace table_namespace
                  ON table_namespace.oid = table_class.relnamespace
                JOIN pg_catalog.pg_attribute table_attribute
                  ON table_attribute.attrelid = table_class.oid
                WHERE table_namespace.nspname = 'public'
                  AND table_class.relkind = 'r'
                  AND table_attribute.attnum > 0
                  AND NOT table_attribute.attisdropped
                  AND col_description(table_class.oid, table_attribute.attnum) IS NULL
                ORDER BY table_class.relname, table_attribute.attnum
                """, String.class);
        assertThat(undocumentedColumns).isEmpty();
    }

    @Test
    @Order(3)
    void upgradesAnExistingV1SchemaToTheLatestVersion() {
        jdbcTemplate.execute("CREATE SCHEMA existing_v1");
        Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .schemas("existing_v1")
                .defaultSchema("existing_v1")
                .locations("classpath:db/migration")
                .target(MigrationVersion.fromVersion("1"))
                .load()
                .migrate();

        Integer taskTableBeforeUpgrade = jdbcTemplate.queryForObject("""
                SELECT count(*)
                FROM information_schema.tables
                WHERE table_schema = 'existing_v1' AND table_name = 'task'
                """, Integer.class);
        assertThat(taskTableBeforeUpgrade).isZero();

        Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .schemas("existing_v1")
                .defaultSchema("existing_v1")
                .locations("classpath:db/migration")
                .load()
                .migrate();

        Integer taskTableAfterUpgrade = jdbcTemplate.queryForObject("""
                SELECT count(*)
                FROM information_schema.tables
                WHERE table_schema = 'existing_v1' AND table_name = 'task'
                """, Integer.class);
        assertThat(taskTableAfterUpgrade).isEqualTo(1);
        Integer syncTableAfterUpgrade = jdbcTemplate.queryForObject("""
                SELECT count(*)
                FROM information_schema.tables
                WHERE table_schema = 'existing_v1' AND table_name = 'sync_mutation'
                """, Integer.class);
        assertThat(syncTableAfterUpgrade).isEqualTo(1);
        Integer deletionRequestTableAfterUpgrade = jdbcTemplate.queryForObject("""
                SELECT count(*)
                FROM information_schema.tables
                WHERE table_schema = 'existing_v1'
                  AND table_name = 'account_deletion_request'
                """, Integer.class);
        assertThat(deletionRequestTableAfterUpgrade).isEqualTo(1);
        String upgradedTaskTableComment = jdbcTemplate.queryForObject("""
                SELECT obj_description('existing_v1.task'::regclass, 'pg_class')
                """, String.class);
        assertThat(upgradedTaskTableComment).contains("行动任务主表");
    }

    @Test
    @Order(4)
    void persistsTasksRevalidatesTransitionsAndIsolatesUsers() throws Exception {
        HttpResponse<String> created = send(
                "POST",
                "/api/v1/tasks",
                """
                        {"title":"Persist me"}
                        """,
                "test-access-token"
        );
        assertThat(created.statusCode()).isEqualTo(201);
        JsonNode task = jsonMapper.readTree(created.body());
        String taskId = task.get("id").asString();

        HttpResponse<String> invalidTransition = send(
                "POST",
                "/api/v1/tasks/" + taskId + "/transition",
                """
                        {"status":"DOING","allowWipOverride":false}
                        """,
                "test-access-token"
        );
        assertThat(invalidTransition.statusCode()).isEqualTo(409);
        assertThat(jsonMapper.readTree(invalidTransition.body()).get("code").asString())
                .isEqualTo("TASK_TRANSITION_INVALID");

        HttpResponse<String> clarified = send(
                "POST",
                "/api/v1/tasks/" + taskId + "/transition",
                """
                        {"status":"READY","allowWipOverride":false}
                        """,
                "test-access-token"
        );
        assertThat(clarified.statusCode()).isEqualTo(200);

        jdbcTemplate.update("""
                INSERT INTO app_user (
                    id, display_name, locale, time_zone, created_at, updated_at, revision
                ) VALUES ('other-user', 'Other', 'en', 'UTC', NOW(), NOW(), 1)
                """);
        jdbcTemplate.update("""
                INSERT INTO task (
                    id, user_id, title, status, visibility, sort_key,
                    created_at, updated_at, revision
                ) VALUES (
                    'other-task', 'other-user', 'Private', 'INBOX', 'ACTIVE',
                    'other', NOW(), NOW(), 1
                )
                """);

        HttpResponse<String> otherTask = send(
                "GET",
                "/api/v1/tasks/other-task",
                null,
                "test-access-token"
        );
        assertThat(otherTask.statusCode()).isEqualTo(404);
        assertThat(jsonMapper.readTree(otherTask.body()).get("code").asString())
                .isEqualTo("TASK_NOT_FOUND");

        HttpResponse<String> bootstrap = send(
                "GET",
                "/api/v1/bootstrap",
                null,
                "test-access-token"
        );
        assertThat(bootstrap.statusCode()).isEqualTo(200);
        String bootstrapBody = bootstrap.body();
        assertThat(bootstrapBody).contains(taskId);
        assertThat(bootstrapBody).doesNotContain("other-task");

        Integer stored = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM task WHERE user_id = 'local-user' AND id = ?",
                Integer.class,
                taskId
        );
        assertThat(stored).isEqualTo(1);
        Integer eventCount = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM task_event WHERE user_id = 'local-user' AND task_id = ?",
                Integer.class,
                taskId
        );
        assertThat(eventCount).isGreaterThanOrEqualTo(2);
    }

    @Test
    @Order(5)
    void revalidatesWipDailyFocusAndProjectFocusRules() throws Exception {
        List<String> taskIds = new ArrayList<>();
        for (int index = 0; index < 4; index++) {
            String taskId = createTask("WIP " + index, null);
            taskIds.add(taskId);
            assertThat(transition(taskId, "READY", false).statusCode()).isEqualTo(200);
        }

        for (int index = 0; index < 3; index++) {
            assertThat(transition(taskIds.get(index), "DOING", false).statusCode())
                    .isEqualTo(200);
        }
        HttpResponse<String> wipExceeded = transition(taskIds.get(3), "DOING", false);
        assertThat(wipExceeded.statusCode()).isEqualTo(409);
        assertThat(jsonMapper.readTree(wipExceeded.body()).get("code").asString())
                .isEqualTo("WIP_LIMIT_EXCEEDED");

        for (int index = 0; index < 3; index++) {
            HttpResponse<String> added = send(
                    "POST",
                    "/api/v1/daily-plans/2026-07-25/items",
                    """
                            {"taskId":"%s","section":"FOCUS","timeZone":"Asia/Shanghai"}
                            """.formatted(taskIds.get(index)),
                    "test-access-token"
            );
            assertThat(added.statusCode()).isEqualTo(200);
        }
        HttpResponse<String> dailyFocusExceeded = send(
                "POST",
                "/api/v1/daily-plans/2026-07-25/items",
                """
                        {"taskId":"%s","section":"FOCUS","timeZone":"Asia/Shanghai"}
                        """.formatted(taskIds.get(3)),
                "test-access-token"
        );
        assertThat(dailyFocusExceeded.statusCode()).isEqualTo(409);
        assertThat(jsonMapper.readTree(dailyFocusExceeded.body()).get("code").asString())
                .isEqualTo("DAILY_FOCUS_LIMIT_EXCEEDED");

        String projectA = createProject("Project A");
        String projectB = createProject("Project B");
        String projectBTask = createTask("Belongs to B", projectB);
        assertThat(transition(projectBTask, "READY", false).statusCode()).isEqualTo(200);

        HttpResponse<String> invalidFocus = send(
                "POST",
                "/api/v1/projects/" + projectA + "/focus",
                """
                        {"taskId":"%s"}
                        """.formatted(projectBTask),
                "test-access-token"
        );
        assertThat(invalidFocus.statusCode()).isEqualTo(409);
        assertThat(jsonMapper.readTree(invalidFocus.body()).get("code").asString())
                .isEqualTo("PROJECT_FOCUS_TASK_INVALID");
    }

    @Test
    @Order(6)
    void synchronizesIdempotentlyMergesCompletionAndReportsDeleteConflicts() throws Exception {
        String taskId = "sync-task";
        String createMutation = mutationJson(
                "sync-create",
                taskId,
                "UPSERT",
                0,
                taskPayload(taskId, "Original title", "INBOX", 1, null)
        );
        JsonNode created = push(createMutation);
        assertThat(created.at("/results/0/status").asString()).isEqualTo("APPLIED");
        assertThat(created.at("/results/0/revision").asLong()).isEqualTo(1);

        JsonNode replayed = push(createMutation);
        assertThat(replayed.at("/results/0/status").asString()).isEqualTo("ALREADY_APPLIED");
        Integer taskCount = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM task WHERE user_id = 'local-user' AND id = ?",
                Integer.class,
                taskId
        );
        Integer createChangeCount = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM change_log WHERE user_id = 'local-user' AND entity_id = ?",
                Integer.class,
                taskId
        );
        assertThat(taskCount).isEqualTo(1);
        assertThat(createChangeCount).isEqualTo(1);

        JsonNode ready = push(mutationJson(
                "sync-ready",
                taskId,
                "UPSERT",
                1,
                taskPayload(taskId, "Original title", "READY", 2, null)
        ));
        assertThat(ready.at("/results/0/status").asString()).isEqualTo("APPLIED");

        JsonNode completed = push(mutationJson(
                "sync-complete",
                taskId,
                "UPSERT",
                2,
                taskPayload(taskId, "Original title", "COMPLETED", 3,
                        "2026-07-25T10:02:00Z")
        ));
        assertThat(completed.at("/results/0/status").asString()).isEqualTo("APPLIED");

        JsonNode staleEdit = push(mutationJson(
                "sync-stale-edit",
                taskId,
                "UPSERT",
                2,
                taskPayload(taskId, "Edited on another device", "READY", 3, null)
        ));
        assertThat(staleEdit.at("/results/0/status").asString()).isEqualTo("APPLIED");
        assertThat(staleEdit.at("/results/0/serverPayload/status").asString())
                .isEqualTo("COMPLETED");
        assertThat(staleEdit.at("/results/0/serverPayload/title").asString())
                .isEqualTo("Edited on another device");

        JsonNode staleDelete = push(mutationJson(
                "sync-stale-delete",
                taskId,
                "DELETE",
                2,
                null
        ));
        assertThat(staleDelete.at("/results/0/status").asString()).isEqualTo("CONFLICT");
        assertThat(staleDelete.at("/results/0/errorCode").asString()).isEqualTo("DELETE_CONFLICT");

        HttpResponse<String> pulled = send(
                "GET",
                "/api/v1/sync/pull?cursor=0&limit=100",
                null,
                "test-access-token"
        );
        assertThat(pulled.statusCode()).isEqualTo(200);
        JsonNode pullBody = jsonMapper.readTree(pulled.body());
        assertThat(pullBody.get("nextCursor").asLong()).isPositive();
        assertThat(pullBody.get("changes").toString()).contains(taskId);
    }

    @Test
    @Order(7)
    void createsAProtectedDeletionRequestWithoutDeletingAccountData() throws Exception {
        HttpResponse<String> first = send(
                "POST",
                "/api/v1/account/deletion-requests",
                null,
                "test-access-token"
        );
        assertThat(first.statusCode()).isEqualTo(200);
        JsonNode firstBody = jsonMapper.readTree(first.body());
        assertThat(firstBody.get("status").asString())
                .isEqualTo("AWAITING_FINAL_CONFIRMATION");
        assertThat(firstBody.get("backupConfirmationRequired").asBoolean()).isTrue();
        assertThat(firstBody.get("finalDeletionAvailable").asBoolean()).isFalse();

        HttpResponse<String> second = send(
                "POST",
                "/api/v1/account/deletion-requests",
                null,
                "test-access-token"
        );
        assertThat(second.statusCode()).isEqualTo(200);

        Integer activeRequests = jdbcTemplate.queryForObject("""
                SELECT count(*) FROM account_deletion_request
                WHERE user_id = 'local-user'
                  AND status = 'AWAITING_FINAL_CONFIRMATION'
                """, Integer.class);
        Integer canceledRequests = jdbcTemplate.queryForObject("""
                SELECT count(*) FROM account_deletion_request
                WHERE user_id = 'local-user' AND status = 'CANCELED'
                """, Integer.class);
        Integer users = jdbcTemplate.queryForObject("""
                SELECT count(*) FROM app_user WHERE id = 'local-user'
                """, Integer.class);
        assertThat(activeRequests).isEqualTo(1);
        assertThat(canceledRequests).isEqualTo(1);
        assertThat(users).isEqualTo(1);
    }

    private JsonNode push(String mutation) throws Exception {
        HttpResponse<String> response = send(
                "POST",
                "/api/v1/sync/push",
                """
                        {"deviceId":"integration-device","mutations":[%s]}
                        """.formatted(mutation),
                "test-access-token"
        );
        assertThat(response.statusCode()).isEqualTo(200);
        return jsonMapper.readTree(response.body());
    }

    private String mutationJson(
            String mutationId,
            String entityId,
            String operation,
            long baseRevision,
            String payload
    ) {
        return """
                {
                  "clientMutationId":"%s",
                  "entityType":"TASK",
                  "entityId":"%s",
                  "operation":"%s",
                  "baseRevision":%d,
                  "occurredAt":"2026-07-25T10:05:00Z",
                  "payload":%s
                }
                """.formatted(
                mutationId,
                entityId,
                operation,
                baseRevision,
                payload == null ? "null" : payload
        );
    }

    private String taskPayload(
            String taskId,
            String title,
            String status,
            long revision,
            String completedAt
    ) {
        String completion = completedAt == null
                ? ""
                : ",\"completedAt\":\"" + completedAt + "\"";
        return """
                {
                  "id":"%s",
                  "userId":"local-user",
                  "title":"%s",
                  "status":"%s",
                  "visibility":"ACTIVE",
                  "sortKey":"2026-07-25T10:00:00Z",
                  "createdAt":"2026-07-25T10:00:00Z",
                  "updatedAt":"2026-07-25T10:04:00Z",
                  "revision":%d%s
                }
                """.formatted(taskId, title, status, revision, completion);
    }

    private String createTask(String title, String projectId) throws Exception {
        String projectField = projectId == null ? "" : ",\"projectId\":\"" + projectId + "\"";
        HttpResponse<String> response = send(
                "POST",
                "/api/v1/tasks",
                "{\"title\":\"" + title + "\"" + projectField + "}",
                "test-access-token"
        );
        assertThat(response.statusCode()).isEqualTo(201);
        return jsonMapper.readTree(response.body()).get("id").asString();
    }

    private String createProject(String name) throws Exception {
        HttpResponse<String> response = send(
                "POST",
                "/api/v1/projects",
                """
                        {"name":"%s"}
                        """.formatted(name),
                "test-access-token"
        );
        assertThat(response.statusCode()).isEqualTo(201);
        return jsonMapper.readTree(response.body()).get("id").asString();
    }

    private HttpResponse<String> transition(
            String taskId,
            String status,
            boolean allowWipOverride
    ) throws Exception {
        return send(
                "POST",
                "/api/v1/tasks/" + taskId + "/transition",
                """
                        {"status":"%s","allowWipOverride":%s}
                        """.formatted(status, allowWipOverride),
                "test-access-token"
        );
    }

    private HttpResponse<String> send(
            String method,
            String path,
            String body,
            String token
    ) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create("http://127.0.0.1:" + port + path))
                .timeout(Duration.ofSeconds(10))
                .header("Accept", "application/json");
        if (token != null) {
            builder.header("Authorization", "Bearer " + token);
        }
        if (body == null) {
            builder.method(method, HttpRequest.BodyPublishers.noBody());
        } else {
            builder.header("Content-Type", "application/json");
            builder.method(method, HttpRequest.BodyPublishers.ofString(body));
        }
        return httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }
}
