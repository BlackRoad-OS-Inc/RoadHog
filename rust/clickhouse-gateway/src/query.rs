use std::time::Instant;

use axum::extract::State;
use axum::Json;
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use crate::error::GatewayError;
use crate::routing::Workload;
use crate::state::AppState;
use crate::validation;

#[derive(Deserialize, Debug, Clone)]
pub struct QueryRequest {
    pub sql: String,
    pub params: Option<serde_json::Value>,
    /// ONLINE, OFFLINE, LOGS, ENDPOINTS, or DEFAULT
    pub workload: String,
    /// Caller identity: APP, API, BATCH_EXPORT, etc.
    pub ch_user: String,
    pub team_id: u64,
    pub org_id: Option<u64>,
    pub read_only: bool,
    pub priority: Option<String>,
    pub cache_ttl_seconds: Option<u64>,
    pub settings: Option<serde_json::Value>,
    pub query_tags: Option<serde_json::Value>,
}

#[derive(Serialize, Debug)]
pub struct QueryResponse {
    pub data: serde_json::Value,
    pub rows: u64,
    pub bytes_read: u64,
    pub elapsed_ms: u64,
}

/// POST /query — the primary gateway endpoint.
///
/// 1. Validates the request (readonly check, settings ceiling)
/// 2. Routes to the correct ClickHouse cluster based on workload
/// 3. Enforces max_execution_time from config (not caller-overridable)
/// 4. Constructs log_comment JSON from query_tags
/// 5. Forwards the query to ClickHouse via HTTP
/// 6. Records metrics
/// 7. Returns the response
pub async fn handle_query(
    State(state): State<AppState>,
    Json(req): Json<QueryRequest>,
) -> Result<Json<QueryResponse>, GatewayError> {
    let start = Instant::now();

    // Parse and validate workload
    let workload = Workload::from_str_value(&req.workload)
        .map_err(|e| GatewayError::InvalidWorkload(e))?;

    // Validate read-only constraint
    validation::validate_readonly(&req)?;

    // Get workload limits from config
    let (_max_concurrent, max_execution_time) = state.config.limits_for_workload(&workload);

    // Enforce settings ceiling
    let mut settings = req.settings.clone().unwrap_or_else(|| serde_json::json!({}));
    validation::enforce_settings_ceiling(&mut settings, max_execution_time);

    // Always set max_execution_time to the config ceiling
    if let Some(obj) = settings.as_object_mut() {
        obj.entry("max_execution_time".to_string())
            .or_insert_with(|| serde_json::Value::Number(max_execution_time.into()));
    }

    // Build log_comment for ClickHouse query attribution
    let log_comment = validation::build_log_comment(req.team_id, &req.ch_user, &req.query_tags);

    // Route to the correct cluster host
    let host = state.router.route(&workload);

    info!(
        team_id = req.team_id,
        workload = workload.as_str(),
        ch_user = %req.ch_user,
        host = %host,
        "routing query"
    );

    // Forward to ClickHouse via HTTP POST
    let response = execute_clickhouse_query(
        &state.http_client,
        host,
        &req.sql,
        &req.params,
        &settings,
        &log_comment,
        max_execution_time,
    )
    .await?;

    let elapsed_ms = start.elapsed().as_millis() as u64;

    // Record metrics
    let labels = [
        ("workload".to_string(), workload.as_str().to_string()),
        ("ch_user".to_string(), req.ch_user.clone()),
    ];
    metrics::counter!("gateway_queries_total", &labels).increment(1);
    metrics::histogram!("gateway_query_duration_ms", &labels).record(elapsed_ms as f64);

    Ok(Json(QueryResponse {
        data: response.data,
        rows: response.rows,
        bytes_read: response.bytes_read,
        elapsed_ms,
    }))
}

struct ClickHouseResponse {
    data: serde_json::Value,
    rows: u64,
    bytes_read: u64,
}

async fn execute_clickhouse_query(
    client: &reqwest::Client,
    host: &str,
    sql: &str,
    params: &Option<serde_json::Value>,
    settings: &serde_json::Value,
    log_comment: &str,
    max_execution_time: u32,
) -> Result<ClickHouseResponse, GatewayError> {
    let url = format!("{host}/");

    // Build query parameters for the ClickHouse HTTP interface
    let mut query_params: Vec<(String, String)> = vec![
        ("log_comment".to_string(), log_comment.to_string()),
        (
            "max_execution_time".to_string(),
            max_execution_time.to_string(),
        ),
        ("output_format_json_quote_64bit_integers".to_string(), "0".to_string()),
    ];

    // Merge caller settings into query params
    if let Some(obj) = settings.as_object() {
        for (k, v) in obj {
            if k == "max_execution_time" {
                continue; // already set above at the ceiling
            }
            let val = match v {
                serde_json::Value::String(s) => s.clone(),
                other => other.to_string(),
            };
            query_params.push((k.clone(), val));
        }
    }

    // Add parameterized query params (param_X for ClickHouse)
    if let Some(p) = params {
        if let Some(obj) = p.as_object() {
            for (k, v) in obj {
                let val = match v {
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string(),
                };
                query_params.push((format!("param_{k}"), val));
            }
        }
    }

    let resp = client
        .post(&url)
        .query(&query_params)
        .header("Content-Type", "text/plain")
        .body(format!("{sql} FORMAT JSON"))
        .send()
        .await
        .map_err(|e| {
            warn!(error = %e, "clickhouse request failed");
            if e.is_timeout() {
                GatewayError::Timeout(max_execution_time)
            } else {
                GatewayError::ClickHouseError(e.to_string())
            }
        })?;

    let status = resp.status();
    let body = resp.text().await.map_err(|e| {
        GatewayError::ClickHouseError(format!("failed to read response body: {e}"))
    })?;

    if !status.is_success() {
        warn!(
            status = %status,
            body_prefix = &body[..body.len().min(500)],
            "clickhouse returned error"
        );
        return Err(GatewayError::ClickHouseError(format!(
            "ClickHouse returned {status}: {body}",
            body = &body[..body.len().min(500)]
        )));
    }

    // Parse ClickHouse JSON response
    let parsed: serde_json::Value = serde_json::from_str(&body).map_err(|e| {
        GatewayError::ClickHouseError(format!("failed to parse response JSON: {e}"))
    })?;

    let rows = parsed["rows"]
        .as_u64()
        .unwrap_or(0);

    let bytes_read = parsed["statistics"]["bytes_read"]
        .as_u64()
        .unwrap_or(0);

    Ok(ClickHouseResponse {
        data: parsed.get("data").cloned().unwrap_or(serde_json::Value::Array(vec![])),
        rows,
        bytes_read,
    })
}
