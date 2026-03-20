use clickhouse_gateway::query::QueryRequest;
use clickhouse_gateway::routing::{Workload, WorkloadRouter};
use clickhouse_gateway::validation;
use std::sync::atomic::AtomicUsize;

fn sample_request() -> QueryRequest {
    QueryRequest {
        sql: "SELECT count() FROM events WHERE team_id = {team_id:UInt64}".to_string(),
        params: Some(serde_json::json!({"team_id": "42"})),
        workload: "ONLINE".to_string(),
        ch_user: "APP".to_string(),
        team_id: 42,
        org_id: Some(1),
        read_only: true,
        priority: None,
        cache_ttl_seconds: None,
        settings: Some(serde_json::json!({"max_execution_time": 10})),
        query_tags: Some(serde_json::json!({"query_id": "test-123", "source": "insights"})),
    }
}

fn make_test_router() -> WorkloadRouter {
    WorkloadRouter::from_config(&clickhouse_gateway::config::Config {
        host: "0.0.0.0".to_string(),
        port: 3100,
        clickhouse_online_hosts: "http://online1:8123,http://online2:8123".to_string(),
        clickhouse_offline_hosts: "http://offline1:8123".to_string(),
        clickhouse_logs_hosts: "http://logs1:8123".to_string(),
        clickhouse_endpoints_hosts: "http://endpoints1:8123".to_string(),
        online_max_concurrent: 50,
        online_max_execution_time: 30,
        offline_max_concurrent: 10,
        offline_max_execution_time: 600,
        logs_max_concurrent: 20,
        logs_max_execution_time: 60,
        endpoints_max_concurrent: 30,
        endpoints_max_execution_time: 120,
        metrics_port: 9090,
        log_level: "info".to_string(),
    })
}

// -- Deserialization tests --

#[test]
fn test_parse_query_request() {
    let json = serde_json::json!({
        "sql": "SELECT 1",
        "workload": "ONLINE",
        "ch_user": "APP",
        "team_id": 42,
        "read_only": true
    });

    let req: QueryRequest = serde_json::from_value(json).unwrap();
    assert_eq!(req.sql, "SELECT 1");
    assert_eq!(req.workload, "ONLINE");
    assert_eq!(req.ch_user, "APP");
    assert_eq!(req.team_id, 42);
    assert!(req.read_only);
    assert!(req.params.is_none());
    assert!(req.settings.is_none());
    assert!(req.query_tags.is_none());
}

#[test]
fn test_parse_query_request_full() {
    let json = serde_json::json!({
        "sql": "SELECT count() FROM events WHERE team_id = {team_id:UInt64}",
        "params": {"team_id": "42"},
        "workload": "OFFLINE",
        "ch_user": "BATCH_EXPORT",
        "team_id": 99,
        "org_id": 7,
        "read_only": true,
        "priority": "low",
        "cache_ttl_seconds": 300,
        "settings": {"max_execution_time": 120},
        "query_tags": {"query_id": "abc", "source": "batch"}
    });

    let req: QueryRequest = serde_json::from_value(json).unwrap();
    assert_eq!(req.workload, "OFFLINE");
    assert_eq!(req.ch_user, "BATCH_EXPORT");
    assert_eq!(req.team_id, 99);
    assert_eq!(req.org_id, Some(7));
    assert_eq!(req.priority, Some("low".to_string()));
    assert_eq!(req.cache_ttl_seconds, Some(300));
}

// -- Routing tests --

#[test]
fn test_route_online() {
    let router = make_test_router();
    let host = router.route(&Workload::Online);
    assert!(host.contains("online"));
}

#[test]
fn test_route_offline() {
    let router = make_test_router();
    let host = router.route(&Workload::Offline);
    assert!(host.contains("offline"));
}

#[test]
fn test_route_logs() {
    let router = make_test_router();
    let host = router.route(&Workload::Logs);
    assert!(host.contains("logs"));
}

#[test]
fn test_route_endpoints() {
    let router = make_test_router();
    let host = router.route(&Workload::Endpoints);
    assert!(host.contains("endpoints"));
}

// -- Validation tests --

#[test]
fn test_validate_readonly_allows_select() {
    let req = sample_request();
    assert!(validation::validate_readonly(&req).is_ok());
}

#[test]
fn test_validate_readonly_rejects_writes() {
    let write_statements = vec![
        "INSERT INTO events VALUES (1)",
        "CREATE TABLE foo (id UInt64) ENGINE = MergeTree",
        "DROP TABLE events",
        "ALTER TABLE events ADD COLUMN x UInt64",
        "TRUNCATE TABLE events",
    ];

    for sql in write_statements {
        let req = QueryRequest {
            sql: sql.to_string(),
            read_only: true,
            ..sample_request()
        };
        assert!(
            validation::validate_readonly(&req).is_err(),
            "should reject: {sql}"
        );
    }
}

#[test]
fn test_validate_readonly_allows_writes_when_not_readonly() {
    let req = QueryRequest {
        sql: "INSERT INTO events VALUES (1)".to_string(),
        read_only: false,
        ..sample_request()
    };
    assert!(validation::validate_readonly(&req).is_ok());
}

// -- Settings ceiling tests --

#[test]
fn test_settings_ceiling_caps_high_value() {
    let mut settings = serde_json::json!({"max_execution_time": 999});
    validation::enforce_settings_ceiling(&mut settings, 30);
    assert_eq!(settings["max_execution_time"], 30);
}

#[test]
fn test_settings_ceiling_preserves_low_value() {
    let mut settings = serde_json::json!({"max_execution_time": 5});
    validation::enforce_settings_ceiling(&mut settings, 30);
    assert_eq!(settings["max_execution_time"], 5);
}

#[test]
fn test_settings_ceiling_no_max_execution_time() {
    let mut settings = serde_json::json!({"some_other_setting": "value"});
    validation::enforce_settings_ceiling(&mut settings, 30);
    // Should not add max_execution_time if not present
    assert!(settings.get("max_execution_time").is_none());
}

// -- Log comment tests --

#[test]
fn test_log_comment_construction_basic() {
    let comment = validation::build_log_comment(42, "APP", &None);
    let parsed: serde_json::Value = serde_json::from_str(&comment).unwrap();
    assert_eq!(parsed["team_id"], 42);
    assert_eq!(parsed["ch_user"], "APP");
}

#[test]
fn test_log_comment_construction_with_tags() {
    let tags = Some(serde_json::json!({
        "query_id": "test-abc",
        "source": "insights",
        "kind": "TrendsQuery"
    }));
    let comment = validation::build_log_comment(42, "API", &tags);
    let parsed: serde_json::Value = serde_json::from_str(&comment).unwrap();

    assert_eq!(parsed["team_id"], 42);
    assert_eq!(parsed["ch_user"], "API");
    assert_eq!(parsed["query_id"], "test-abc");
    assert_eq!(parsed["source"], "insights");
    assert_eq!(parsed["kind"], "TrendsQuery");
}

#[test]
fn test_log_comment_construction_empty_tags() {
    let tags = Some(serde_json::json!({}));
    let comment = validation::build_log_comment(1, "BATCH_EXPORT", &tags);
    let parsed: serde_json::Value = serde_json::from_str(&comment).unwrap();
    assert_eq!(parsed["team_id"], 1);
    assert_eq!(parsed["ch_user"], "BATCH_EXPORT");
}

// -- Workload parsing tests --

#[test]
fn test_workload_parsing() {
    assert_eq!(Workload::from_str_value("ONLINE").unwrap(), Workload::Online);
    assert_eq!(Workload::from_str_value("offline").unwrap(), Workload::Offline);
    assert_eq!(Workload::from_str_value("Logs").unwrap(), Workload::Logs);
    assert_eq!(
        Workload::from_str_value("ENDPOINTS").unwrap(),
        Workload::Endpoints
    );
    assert!(Workload::from_str_value("UNKNOWN").is_err());
}
