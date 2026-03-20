use crate::error::GatewayError;
use crate::query::QueryRequest;

/// Patterns that indicate a write operation in SQL.
const WRITE_PATTERNS: &[&str] = &[
    "INSERT",
    "CREATE",
    "DROP",
    "ALTER",
    "TRUNCATE",
    "RENAME",
    "ATTACH",
    "DETACH",
    "OPTIMIZE",
    "KILL",
];

/// Validates that a query marked as read_only does not contain write operations.
pub fn validate_readonly(req: &QueryRequest) -> Result<(), GatewayError> {
    if !req.read_only {
        return Ok(());
    }

    let sql_upper = req.sql.trim().to_uppercase();
    for pattern in WRITE_PATTERNS {
        if sql_upper.starts_with(pattern) {
            return Err(GatewayError::WriteNotAllowed);
        }
    }

    Ok(())
}

/// Enforces the max_execution_time ceiling from server config.
/// Callers cannot set a value higher than the workload's configured maximum.
pub fn enforce_settings_ceiling(
    settings: &mut serde_json::Value,
    config_max_execution_time: u32,
) {
    if let Some(obj) = settings.as_object_mut() {
        if let Some(met) = obj.get("max_execution_time") {
            if let Some(requested) = met.as_u64() {
                if requested > config_max_execution_time as u64 {
                    obj.insert(
                        "max_execution_time".to_string(),
                        serde_json::Value::Number(config_max_execution_time.into()),
                    );
                }
            }
        }
    }
}

/// Constructs a ClickHouse `log_comment` JSON string from query_tags and request metadata.
pub fn build_log_comment(
    team_id: u64,
    ch_user: &str,
    query_tags: &Option<serde_json::Value>,
) -> String {
    let mut comment = serde_json::json!({
        "team_id": team_id,
        "ch_user": ch_user,
    });

    if let Some(tags) = query_tags {
        if let Some(tags_obj) = tags.as_object() {
            if let Some(comment_obj) = comment.as_object_mut() {
                for (k, v) in tags_obj {
                    comment_obj.insert(k.clone(), v.clone());
                }
            }
        }
    }

    comment.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_readonly_allows_select() {
        let req = QueryRequest {
            sql: "SELECT count() FROM events".to_string(),
            params: None,
            workload: "ONLINE".to_string(),
            ch_user: "APP".to_string(),
            team_id: 1,
            org_id: None,
            read_only: true,
            priority: None,
            cache_ttl_seconds: None,
            settings: None,
            query_tags: None,
        };
        assert!(validate_readonly(&req).is_ok());
    }

    #[test]
    fn test_validate_readonly_rejects_insert() {
        let req = QueryRequest {
            sql: "INSERT INTO events VALUES (1, 2, 3)".to_string(),
            params: None,
            workload: "ONLINE".to_string(),
            ch_user: "APP".to_string(),
            team_id: 1,
            org_id: None,
            read_only: true,
            priority: None,
            cache_ttl_seconds: None,
            settings: None,
            query_tags: None,
        };
        assert!(validate_readonly(&req).is_err());
    }

    #[test]
    fn test_validate_readonly_allows_insert_when_not_readonly() {
        let req = QueryRequest {
            sql: "INSERT INTO events VALUES (1, 2, 3)".to_string(),
            params: None,
            workload: "ONLINE".to_string(),
            ch_user: "APP".to_string(),
            team_id: 1,
            org_id: None,
            read_only: false,
            priority: None,
            cache_ttl_seconds: None,
            settings: None,
            query_tags: None,
        };
        assert!(validate_readonly(&req).is_ok());
    }

    #[test]
    fn test_validate_readonly_rejects_drop() {
        let req = QueryRequest {
            sql: "DROP TABLE events".to_string(),
            params: None,
            workload: "ONLINE".to_string(),
            ch_user: "APP".to_string(),
            team_id: 1,
            org_id: None,
            read_only: true,
            priority: None,
            cache_ttl_seconds: None,
            settings: None,
            query_tags: None,
        };
        assert!(validate_readonly(&req).is_err());
    }

    #[test]
    fn test_enforce_settings_ceiling_caps_value() {
        let mut settings = serde_json::json!({
            "max_execution_time": 999
        });
        enforce_settings_ceiling(&mut settings, 30);
        assert_eq!(settings["max_execution_time"], 30);
    }

    #[test]
    fn test_enforce_settings_ceiling_allows_lower() {
        let mut settings = serde_json::json!({
            "max_execution_time": 10
        });
        enforce_settings_ceiling(&mut settings, 30);
        assert_eq!(settings["max_execution_time"], 10);
    }

    #[test]
    fn test_build_log_comment_without_tags() {
        let comment = build_log_comment(42, "APP", &None);
        let parsed: serde_json::Value = serde_json::from_str(&comment).unwrap();
        assert_eq!(parsed["team_id"], 42);
        assert_eq!(parsed["ch_user"], "APP");
    }

    #[test]
    fn test_build_log_comment_with_tags() {
        let tags = Some(serde_json::json!({
            "query_id": "abc-123",
            "source": "insights"
        }));
        let comment = build_log_comment(42, "APP", &tags);
        let parsed: serde_json::Value = serde_json::from_str(&comment).unwrap();
        assert_eq!(parsed["team_id"], 42);
        assert_eq!(parsed["ch_user"], "APP");
        assert_eq!(parsed["query_id"], "abc-123");
        assert_eq!(parsed["source"], "insights");
    }
}
