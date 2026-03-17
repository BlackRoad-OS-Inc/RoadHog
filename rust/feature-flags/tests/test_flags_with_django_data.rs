//! Integration tests that create cohorts and flags via the Django serializers
//! (`create_test_data.py`) to ensure the Rust `/flags` endpoint handles
//! production-realistic data — including `cohort_type`, bytecode, and filter
//! validation that only the Django serializer provides.
//!
//! These tests exist because raw DB inserts in `test_flags.rs` bypass the
//! `CohortSerializer`, which means `cohort_type` is always `None` and bytecode
//! is never computed. This masked a regression where realtime cohorts (those
//! with `cohort_type = "realtime"`) were incorrectly routed to the
//! `NoOpCohortMembershipProvider` instead of being evaluated via property
//! matching / bytecode.
//!
//! **Person/group creation stays as raw DB inserts** — there are no meaningful
//! serializer side-effects for those models.
//!
//! **Cohort and flag creation goes through Django** — matching production.

use anyhow::Result;
use assert_json_diff::assert_json_include;
use reqwest::StatusCode;
use serde_json::{json, Value};

use crate::common::*;

use feature_flags::config::DEFAULT_TEST_CONFIG;
use feature_flags::utils::test_utils::{
    insert_flags_for_team_in_redis, insert_new_team_in_redis, setup_redis_client, TestContext,
};

pub mod common;

// ─── Helpers ────────────────────────────────────────────────────────────────

/// Build the HyperCache flag JSON that `insert_flags_for_team_in_redis` expects,
/// given a Django-created flag's id/key/filters plus the team_id.
fn flag_json_for_redis(
    flag_id: i32,
    team_id: i32,
    key: &str,
    name: &str,
    filters: &Value,
) -> Value {
    json!([{
        "id": flag_id,
        "key": key,
        "name": name,
        "active": true,
        "deleted": false,
        "team_id": team_id,
        "filters": filters,
    }])
}

// ─── Tests ──────────────────────────────────────────────────────────────────

/// A cohort created with simple person-property filters gets `cohort_type = "realtime"`
/// from the Django serializer. The Rust `/flags` endpoint must still correctly evaluate
/// membership for such cohorts via property matching.
///
/// This is the **exact scenario** that regressed in PR #51002: realtime cohorts were
/// sent to `NoOpCohortMembershipProvider` which always returns "not a member".
#[tokio::test]
async fn test_realtime_cohort_with_person_property_filter() -> Result<()> {
    let config = DEFAULT_TEST_CONFIG.clone();
    let distinct_id = "realtime_cohort_user".to_string();

    let client = setup_redis_client(Some(config.redis_url.clone())).await;
    let team = insert_new_team_in_redis(client.clone()).await.unwrap();
    let token = team.api_token.clone();

    let context = TestContext::new(None).await;
    context.insert_new_team(Some(team.id)).await.unwrap();

    // Person with matching email
    context
        .insert_person(
            team.id,
            distinct_id.clone(),
            Some(json!({"email": "user@posthog.com"})),
        )
        .await
        .unwrap();

    // Create cohort + flag through Django serializers in a single batch.
    // The cohort has a simple person-property filter which Django marks as `realtime`.
    let result = context.create_via_django_batch(
        team.id,
        vec![
            json!({
                "type": "create_cohort",
                "name": "PostHog Email Users",
                "filters": {
                    "properties": {
                        "type": "OR",
                        "values": [{
                            "type": "AND",
                            "values": [{
                                "key": "email",
                                "type": "person",
                                "value": "@posthog.com",
                                "operator": "icontains"
                            }]
                        }]
                    }
                },
                "is_static": false
            }),
            json!({
                "type": "create_flag",
                "key": "realtime-cohort-flag",
                "name": "Realtime Cohort Flag",
                "filters": {
                    "groups": [{
                        "properties": [{
                            "key": "id",
                            "type": "cohort",
                            "value": "$cohort_0"
                        }],
                        "rollout_percentage": 100
                    }]
                }
            }),
        ],
    )?;

    // Verify the cohort was classified as realtime — the whole point of using Django.
    let cohort_result = &result.results[0];
    assert_eq!(
        cohort_result["cohort_type"].as_str(),
        Some("realtime"),
        "Django should classify a person-property cohort as realtime, got: {:?}",
        cohort_result["cohort_type"]
    );

    let flag_result = &result.results[1];
    let flag_id = flag_result["id"].as_i64().unwrap() as i32;
    let flag_key = flag_result["key"].as_str().unwrap();
    let flag_filters = &flag_result["filters"];

    // Push flag definitions into HyperCache (the Rust server reads from there).
    let flag_json = flag_json_for_redis(
        flag_id,
        team.id,
        flag_key,
        "Realtime Cohort Flag",
        flag_filters,
    );
    insert_flags_for_team_in_redis(client.clone(), team.id, Some(flag_json.to_string())).await?;

    let server = ServerHandle::for_config(config).await;

    // ── Matching user ──
    let res = server
        .send_flags_request(
            json!({"token": token, "distinct_id": distinct_id}).to_string(),
            Some("2"),
            None,
        )
        .await;
    assert_eq!(res.status(), StatusCode::OK);

    let json_data = res.json::<Value>().await?;
    assert_json_include!(
        actual: json_data,
        expected: json!({
            "errorsWhileComputingFlags": false,
            "flags": {
                "realtime-cohort-flag": {
                    "key": "realtime-cohort-flag",
                    "enabled": true
                }
            }
        })
    );

    // ── Non-matching user ──
    let non_matching_id = "non_matching_user".to_string();
    context
        .insert_person(
            team.id,
            non_matching_id.clone(),
            Some(json!({"email": "user@gmail.com"})),
        )
        .await
        .unwrap();

    let res = server
        .send_flags_request(
            json!({"token": token, "distinct_id": non_matching_id}).to_string(),
            Some("2"),
            None,
        )
        .await;
    assert_eq!(res.status(), StatusCode::OK);

    let json_data = res.json::<Value>().await?;
    assert_json_include!(
        actual: json_data,
        expected: json!({
            "errorsWhileComputingFlags": false,
            "flags": {
                "realtime-cohort-flag": {
                    "key": "realtime-cohort-flag",
                    "enabled": false
                }
            }
        })
    );

    Ok(())
}

/// Same as above but with multiple person-property conditions (AND logic).
/// Django should still classify this as realtime since all leaf filters support bytecode.
#[tokio::test]
async fn test_realtime_cohort_with_multiple_person_property_conditions() -> Result<()> {
    let config = DEFAULT_TEST_CONFIG.clone();
    let client = setup_redis_client(Some(config.redis_url.clone())).await;
    let team = insert_new_team_in_redis(client.clone()).await.unwrap();
    let token = team.api_token.clone();

    let context = TestContext::new(None).await;
    context.insert_new_team(Some(team.id)).await.unwrap();

    // Person matching all conditions
    context
        .insert_person(
            team.id,
            "multi_prop_user".to_string(),
            Some(json!({
                "email": "dev@posthog.com",
                "plan": "enterprise",
                "country": "US"
            })),
        )
        .await
        .unwrap();

    // Person matching only some conditions
    context
        .insert_person(
            team.id,
            "partial_match_user".to_string(),
            Some(json!({
                "email": "dev@posthog.com",
                "plan": "free",
                "country": "US"
            })),
        )
        .await
        .unwrap();

    let result = context.create_via_django_batch(
        team.id,
        vec![
            json!({
                "type": "create_cohort",
                "name": "Enterprise PostHog US",
                "filters": {
                    "properties": {
                        "type": "OR",
                        "values": [{
                            "type": "AND",
                            "values": [
                                {
                                    "key": "email",
                                    "type": "person",
                                    "value": "@posthog.com",
                                    "operator": "icontains"
                                },
                                {
                                    "key": "plan",
                                    "type": "person",
                                    "value": "enterprise",
                                    "operator": "exact"
                                },
                                {
                                    "key": "country",
                                    "type": "person",
                                    "value": "US",
                                    "operator": "exact"
                                }
                            ]
                        }]
                    }
                },
                "is_static": false
            }),
            json!({
                "type": "create_flag",
                "key": "multi-prop-cohort-flag",
                "name": "Multi Property Cohort Flag",
                "filters": {
                    "groups": [{
                        "properties": [{
                            "key": "id",
                            "type": "cohort",
                            "value": "$cohort_0"
                        }],
                        "rollout_percentage": 100
                    }]
                }
            }),
        ],
    )?;

    // Verify realtime classification
    assert_eq!(
        result.results[0]["cohort_type"].as_str(),
        Some("realtime"),
        "Multi-property cohort should be realtime"
    );

    let flag = &result.results[1];
    let flag_json = flag_json_for_redis(
        flag["id"].as_i64().unwrap() as i32,
        team.id,
        flag["key"].as_str().unwrap(),
        "Multi Property Cohort Flag",
        &flag["filters"],
    );
    insert_flags_for_team_in_redis(client.clone(), team.id, Some(flag_json.to_string())).await?;

    let server = ServerHandle::for_config(config).await;

    // Full match
    let res = server
        .send_flags_request(
            json!({"token": token, "distinct_id": "multi_prop_user"}).to_string(),
            Some("2"),
            None,
        )
        .await;
    assert_eq!(res.status(), StatusCode::OK);
    let json_data = res.json::<Value>().await?;
    assert_json_include!(
        actual: json_data,
        expected: json!({
            "errorsWhileComputingFlags": false,
            "flags": {
                "multi-prop-cohort-flag": {
                    "key": "multi-prop-cohort-flag",
                    "enabled": true
                }
            }
        })
    );

    // Partial match — should NOT match because plan != enterprise
    let res = server
        .send_flags_request(
            json!({"token": token, "distinct_id": "partial_match_user"}).to_string(),
            Some("2"),
            None,
        )
        .await;
    assert_eq!(res.status(), StatusCode::OK);
    let json_data = res.json::<Value>().await?;
    assert_json_include!(
        actual: json_data,
        expected: json!({
            "errorsWhileComputingFlags": false,
            "flags": {
                "multi-prop-cohort-flag": {
                    "key": "multi-prop-cohort-flag",
                    "enabled": false
                }
            }
        })
    );

    Ok(())
}

/// Cohort with regex and negation filters — Django serializer marks this as realtime.
/// Reproduces the pattern from `test_cohort_filter_with_regex_and_negation` but with
/// realistic serialized data.
#[tokio::test]
async fn test_realtime_cohort_with_regex_and_negation() -> Result<()> {
    let config = DEFAULT_TEST_CONFIG.clone();
    let client = setup_redis_client(Some(config.redis_url.clone())).await;
    let team = insert_new_team_in_redis(client.clone()).await.unwrap();
    let token = team.api_token.clone();

    let context = TestContext::new(None).await;
    context.insert_new_team(Some(team.id)).await.unwrap();

    // Should match: email matches regex, not excluded
    context
        .insert_person(
            team.id,
            "good_user".to_string(),
            Some(json!({"email": "test.user@example.com"})),
        )
        .await
        .unwrap();

    // Should NOT match: excluded by negation
    context
        .insert_person(
            team.id,
            "excluded_user".to_string(),
            Some(json!({"email": "excluded.user@example.com"})),
        )
        .await
        .unwrap();

    // Should NOT match: doesn't match regex
    context
        .insert_person(
            team.id,
            "other_domain_user".to_string(),
            Some(json!({"email": "user@other.com"})),
        )
        .await
        .unwrap();

    let result = context.create_via_django_batch(
        team.id,
        vec![
            json!({
                "type": "create_cohort",
                "name": "Example Domain (excluding specific user)",
                "filters": {
                    "properties": {
                        "type": "OR",
                        "values": [{
                            "type": "AND",
                            "values": [
                                {
                                    "key": "email",
                                    "type": "person",
                                    "value": "^.*@example.com$",
                                    "negation": false,
                                    "operator": "regex"
                                },
                                {
                                    "key": "email",
                                    "type": "person",
                                    "value": "excluded.user@example.com",
                                    "negation": true,
                                    "operator": "icontains"
                                }
                            ]
                        }]
                    }
                },
                "is_static": false
            }),
            json!({
                "type": "create_flag",
                "key": "regex-negation-cohort-flag",
                "name": "Regex + Negation Cohort Flag",
                "filters": {
                    "groups": [{
                        "properties": [{
                            "key": "id",
                            "type": "cohort",
                            "value": "$cohort_0"
                        }],
                        "rollout_percentage": 100
                    }]
                }
            }),
        ],
    )?;

    assert_eq!(
        result.results[0]["cohort_type"].as_str(),
        Some("realtime"),
        "Regex + negation person-property cohort should be realtime"
    );

    let flag = &result.results[1];
    let flag_json = flag_json_for_redis(
        flag["id"].as_i64().unwrap() as i32,
        team.id,
        flag["key"].as_str().unwrap(),
        "Regex + Negation Cohort Flag",
        &flag["filters"],
    );
    insert_flags_for_team_in_redis(client.clone(), team.id, Some(flag_json.to_string())).await?;

    let server = ServerHandle::for_config(config).await;

    // Matching user
    let res = server
        .send_flags_request(
            json!({"token": token, "distinct_id": "good_user"}).to_string(),
            Some("2"),
            None,
        )
        .await;
    assert_eq!(res.status(), StatusCode::OK);
    assert_json_include!(
        actual: res.json::<Value>().await?,
        expected: json!({
            "errorsWhileComputingFlags": false,
            "flags": {
                "regex-negation-cohort-flag": {
                    "key": "regex-negation-cohort-flag",
                    "enabled": true
                }
            }
        })
    );

    // Excluded user
    let res = server
        .send_flags_request(
            json!({"token": token, "distinct_id": "excluded_user"}).to_string(),
            Some("2"),
            None,
        )
        .await;
    assert_eq!(res.status(), StatusCode::OK);
    assert_json_include!(
        actual: res.json::<Value>().await?,
        expected: json!({
            "errorsWhileComputingFlags": false,
            "flags": {
                "regex-negation-cohort-flag": {
                    "key": "regex-negation-cohort-flag",
                    "enabled": false
                }
            }
        })
    );

    // Wrong domain user
    let res = server
        .send_flags_request(
            json!({"token": token, "distinct_id": "other_domain_user"}).to_string(),
            Some("2"),
            None,
        )
        .await;
    assert_eq!(res.status(), StatusCode::OK);
    assert_json_include!(
        actual: res.json::<Value>().await?,
        expected: json!({
            "errorsWhileComputingFlags": false,
            "flags": {
                "regex-negation-cohort-flag": {
                    "key": "regex-negation-cohort-flag",
                    "enabled": false
                }
            }
        })
    );

    Ok(())
}

/// Nested cohorts: outer cohort references inner cohort via `$cohort_0`.
/// Both cohorts have person-property filters, so Django marks both as realtime.
/// The Rust evaluator must recursively resolve the nested cohort membership.
#[tokio::test]
async fn test_nested_realtime_cohorts() -> Result<()> {
    let config = DEFAULT_TEST_CONFIG.clone();
    let client = setup_redis_client(Some(config.redis_url.clone())).await;
    let team = insert_new_team_in_redis(client.clone()).await.unwrap();
    let token = team.api_token.clone();

    let context = TestContext::new(None).await;
    context.insert_new_team(Some(team.id)).await.unwrap();

    // User matching both inner and outer cohort
    context
        .insert_person(
            team.id,
            "nested_match".to_string(),
            Some(json!({
                "email": "dev@posthog.com",
                "days_since_paid_plan_start": 77
            })),
        )
        .await
        .unwrap();

    // User matching inner but not outer
    context
        .insert_person(
            team.id,
            "inner_only".to_string(),
            Some(json!({
                "email": "dev@posthog.com",
                "days_since_paid_plan_start": 500
            })),
        )
        .await
        .unwrap();

    // User matching neither
    context
        .insert_person(
            team.id,
            "no_match".to_string(),
            Some(json!({
                "email": "dev@gmail.com",
                "days_since_paid_plan_start": 500
            })),
        )
        .await
        .unwrap();

    let result = context.create_via_django_batch(
        team.id,
        vec![
            // Inner cohort: @posthog.com emails
            json!({
                "type": "create_cohort",
                "name": "PostHog Emails",
                "filters": {
                    "properties": {
                        "type": "OR",
                        "values": [{
                            "type": "AND",
                            "values": [{
                                "key": "email",
                                "type": "person",
                                "value": "@posthog.com",
                                "operator": "icontains"
                            }]
                        }]
                    }
                },
                "is_static": false
            }),
            // Outer cohort: in inner cohort AND days_since_paid_plan_start < 365
            json!({
                "type": "create_cohort",
                "name": "Recent PostHog Users",
                "filters": {
                    "properties": {
                        "type": "OR",
                        "values": [{
                            "type": "AND",
                            "values": [
                                {
                                    "key": "id",
                                    "type": "cohort",
                                    "value": "$cohort_0"
                                },
                                {
                                    "key": "days_since_paid_plan_start",
                                    "type": "person",
                                    "value": "365",
                                    "operator": "lt"
                                }
                            ]
                        }]
                    }
                },
                "is_static": false
            }),
            // Flag targeting the outer cohort
            json!({
                "type": "create_flag",
                "key": "nested-cohort-flag",
                "name": "Nested Cohort Flag",
                "filters": {
                    "groups": [{
                        "properties": [{
                            "key": "id",
                            "type": "cohort",
                            "value": "$cohort_1"
                        }],
                        "rollout_percentage": 100
                    }]
                }
            }),
        ],
    )?;

    // Both cohorts should be realtime (inner has person prop, outer has cohort ref + person prop)
    assert_eq!(
        result.results[0]["cohort_type"].as_str(),
        Some("realtime"),
        "Inner cohort should be realtime"
    );
    // NOTE: the outer cohort may or may not be realtime depending on whether Django considers
    // a cohort-reference filter as having valid bytecode. Either way, the evaluation must work.

    let flag = &result.results[2];
    let flag_json = flag_json_for_redis(
        flag["id"].as_i64().unwrap() as i32,
        team.id,
        flag["key"].as_str().unwrap(),
        "Nested Cohort Flag",
        &flag["filters"],
    );
    insert_flags_for_team_in_redis(client.clone(), team.id, Some(flag_json.to_string())).await?;

    let server = ServerHandle::for_config(config).await;

    // Matches both inner and outer
    let res = server
        .send_flags_request(
            json!({"token": token, "distinct_id": "nested_match"}).to_string(),
            Some("2"),
            None,
        )
        .await;
    assert_eq!(res.status(), StatusCode::OK);
    assert_json_include!(
        actual: res.json::<Value>().await?,
        expected: json!({
            "errorsWhileComputingFlags": false,
            "flags": {
                "nested-cohort-flag": {
                    "key": "nested-cohort-flag",
                    "enabled": true
                }
            }
        })
    );

    // Matches inner only (email matches, days too high)
    let res = server
        .send_flags_request(
            json!({"token": token, "distinct_id": "inner_only"}).to_string(),
            Some("2"),
            None,
        )
        .await;
    assert_eq!(res.status(), StatusCode::OK);
    assert_json_include!(
        actual: res.json::<Value>().await?,
        expected: json!({
            "errorsWhileComputingFlags": false,
            "flags": {
                "nested-cohort-flag": {
                    "key": "nested-cohort-flag",
                    "enabled": false
                }
            }
        })
    );

    // Matches neither
    let res = server
        .send_flags_request(
            json!({"token": token, "distinct_id": "no_match"}).to_string(),
            Some("2"),
            None,
        )
        .await;
    assert_eq!(res.status(), StatusCode::OK);
    assert_json_include!(
        actual: res.json::<Value>().await?,
        expected: json!({
            "errorsWhileComputingFlags": false,
            "flags": {
                "nested-cohort-flag": {
                    "key": "nested-cohort-flag",
                    "enabled": false
                }
            }
        })
    );

    Ok(())
}

/// Cohort with AND + negated cohort reference: user must be in the main cohort
/// AND NOT in the excluded cohort. Both are realtime (person-property filters).
#[tokio::test]
async fn test_realtime_cohort_with_negated_cohort_reference() -> Result<()> {
    let config = DEFAULT_TEST_CONFIG.clone();
    let client = setup_redis_client(Some(config.redis_url.clone())).await;
    let team = insert_new_team_in_redis(client.clone()).await.unwrap();
    let token = team.api_token.clone();

    let context = TestContext::new(None).await;
    context.insert_new_team(Some(team.id)).await.unwrap();

    // Should match: posthog email, not admin
    context
        .insert_person(
            team.id,
            "engineer".to_string(),
            Some(json!({"email": "engineer@posthog.com"})),
        )
        .await
        .unwrap();

    // Should NOT match: posthog email but admin
    context
        .insert_person(
            team.id,
            "admin".to_string(),
            Some(json!({"email": "admin@posthog.com"})),
        )
        .await
        .unwrap();

    // Should NOT match: not posthog
    context
        .insert_person(
            team.id,
            "external".to_string(),
            Some(json!({"email": "user@example.com"})),
        )
        .await
        .unwrap();

    let result = context.create_via_django_batch(
        team.id,
        vec![
            // Excluded cohort: admin users
            json!({
                "type": "create_cohort",
                "name": "Admin Users",
                "filters": {
                    "properties": {
                        "type": "OR",
                        "values": [{
                            "type": "OR",
                            "values": [{
                                "key": "email",
                                "type": "person",
                                "value": "admin@posthog.com",
                                "operator": "exact"
                            }]
                        }]
                    }
                },
                "is_static": false
            }),
            // Main cohort: @posthog.com AND NOT in excluded cohort
            json!({
                "type": "create_cohort",
                "name": "Non-Admin PostHog Users",
                "filters": {
                    "properties": {
                        "type": "OR",
                        "values": [{
                            "type": "AND",
                            "values": [
                                {
                                    "key": "email",
                                    "type": "person",
                                    "value": "@posthog.com",
                                    "operator": "regex"
                                },
                                {
                                    "key": "id",
                                    "type": "cohort",
                                    "value": "$cohort_0",
                                    "negation": true
                                }
                            ]
                        }]
                    }
                },
                "is_static": false
            }),
            json!({
                "type": "create_flag",
                "key": "non-admin-flag",
                "name": "Non-Admin Flag",
                "filters": {
                    "groups": [{
                        "properties": [{
                            "key": "id",
                            "type": "cohort",
                            "value": "$cohort_1"
                        }],
                        "rollout_percentage": 100
                    }]
                }
            }),
        ],
    )?;

    // Admin cohort should be realtime
    assert_eq!(
        result.results[0]["cohort_type"].as_str(),
        Some("realtime"),
        "Admin cohort should be realtime"
    );

    let flag = &result.results[2];
    let flag_json = flag_json_for_redis(
        flag["id"].as_i64().unwrap() as i32,
        team.id,
        flag["key"].as_str().unwrap(),
        "Non-Admin Flag",
        &flag["filters"],
    );
    insert_flags_for_team_in_redis(client.clone(), team.id, Some(flag_json.to_string())).await?;

    let server = ServerHandle::for_config(config).await;

    // Engineer: matches @posthog.com, NOT admin → enabled
    let res = server
        .send_flags_request(
            json!({"token": token, "distinct_id": "engineer"}).to_string(),
            Some("2"),
            None,
        )
        .await;
    assert_eq!(res.status(), StatusCode::OK);
    assert_json_include!(
        actual: res.json::<Value>().await?,
        expected: json!({
            "errorsWhileComputingFlags": false,
            "flags": {
                "non-admin-flag": {
                    "key": "non-admin-flag",
                    "enabled": true
                }
            }
        })
    );

    // Admin: matches @posthog.com, BUT is admin → disabled
    let res = server
        .send_flags_request(
            json!({"token": token, "distinct_id": "admin"}).to_string(),
            Some("2"),
            None,
        )
        .await;
    assert_eq!(res.status(), StatusCode::OK);
    assert_json_include!(
        actual: res.json::<Value>().await?,
        expected: json!({
            "errorsWhileComputingFlags": false,
            "flags": {
                "non-admin-flag": {
                    "key": "non-admin-flag",
                    "enabled": false
                }
            }
        })
    );

    // External: doesn't match @posthog.com → disabled
    let res = server
        .send_flags_request(
            json!({"token": token, "distinct_id": "external"}).to_string(),
            Some("2"),
            None,
        )
        .await;
    assert_eq!(res.status(), StatusCode::OK);
    assert_json_include!(
        actual: res.json::<Value>().await?,
        expected: json!({
            "errorsWhileComputingFlags": false,
            "flags": {
                "non-admin-flag": {
                    "key": "non-admin-flag",
                    "enabled": false
                }
            }
        })
    );

    Ok(())
}

/// A cohort with a date comparison filter (is_date_after) — Django should classify
/// this as realtime. Verifies the Rust evaluator handles date comparisons correctly
/// when the cohort is realtime.
#[tokio::test]
async fn test_realtime_cohort_with_date_filter() -> Result<()> {
    let config = DEFAULT_TEST_CONFIG.clone();
    let client = setup_redis_client(Some(config.redis_url.clone())).await;
    let team = insert_new_team_in_redis(client.clone()).await.unwrap();
    let token = team.api_token.clone();

    let context = TestContext::new(None).await;
    context.insert_new_team(Some(team.id)).await.unwrap();

    // Person with date after the threshold
    context
        .insert_person(
            team.id,
            "recent_signup".to_string(),
            Some(json!({"signup_date": "2025-12-19T00:00:00.000"})),
        )
        .await
        .unwrap();

    // Person with date before the threshold
    context
        .insert_person(
            team.id,
            "old_signup".to_string(),
            Some(json!({"signup_date": "2025-01-01T00:00:00.000"})),
        )
        .await
        .unwrap();

    let result = context.create_via_django_batch(
        team.id,
        vec![
            json!({
                "type": "create_cohort",
                "name": "Recent Signups",
                "filters": {
                    "properties": {
                        "type": "OR",
                        "values": [{
                            "type": "AND",
                            "values": [{
                                "key": "signup_date",
                                "type": "person",
                                "value": "2025-12-01",
                                "operator": "is_date_after"
                            }]
                        }]
                    }
                },
                "is_static": false
            }),
            json!({
                "type": "create_flag",
                "key": "date-cohort-flag",
                "name": "Date Cohort Flag",
                "filters": {
                    "groups": [{
                        "properties": [{
                            "key": "id",
                            "type": "cohort",
                            "value": "$cohort_0"
                        }],
                        "rollout_percentage": 100
                    }]
                }
            }),
        ],
    )?;

    // Verify the cohort is realtime
    assert_eq!(
        result.results[0]["cohort_type"].as_str(),
        Some("realtime"),
        "Date-filter cohort should be realtime"
    );

    let flag = &result.results[1];
    let flag_json = flag_json_for_redis(
        flag["id"].as_i64().unwrap() as i32,
        team.id,
        flag["key"].as_str().unwrap(),
        "Date Cohort Flag",
        &flag["filters"],
    );
    insert_flags_for_team_in_redis(client.clone(), team.id, Some(flag_json.to_string())).await?;

    let server = ServerHandle::for_config(config).await;

    // Recent signup: date is after threshold → enabled
    let res = server
        .send_flags_request(
            json!({"token": token, "distinct_id": "recent_signup"}).to_string(),
            Some("2"),
            None,
        )
        .await;
    assert_eq!(res.status(), StatusCode::OK);
    assert_json_include!(
        actual: res.json::<Value>().await?,
        expected: json!({
            "errorsWhileComputingFlags": false,
            "flags": {
                "date-cohort-flag": {
                    "key": "date-cohort-flag",
                    "enabled": true
                }
            }
        })
    );

    // Old signup: date is before threshold → disabled
    let res = server
        .send_flags_request(
            json!({"token": token, "distinct_id": "old_signup"}).to_string(),
            Some("2"),
            None,
        )
        .await;
    assert_eq!(res.status(), StatusCode::OK);
    assert_json_include!(
        actual: res.json::<Value>().await?,
        expected: json!({
            "errorsWhileComputingFlags": false,
            "flags": {
                "date-cohort-flag": {
                    "key": "date-cohort-flag",
                    "enabled": false
                }
            }
        })
    );

    Ok(())
}

/// Super condition with cohort filter — the flag has a super_groups condition
/// that short-circuits evaluation, plus a regular condition with a realtime cohort.
/// Verifies that super condition evaluation works correctly when the underlying
/// cohort is realtime.
#[tokio::test]
async fn test_super_condition_with_realtime_cohort() -> Result<()> {
    let config = DEFAULT_TEST_CONFIG.clone();
    let client = setup_redis_client(Some(config.redis_url.clone())).await;
    let team = insert_new_team_in_redis(client.clone()).await.unwrap();
    let token = team.api_token.clone();

    let context = TestContext::new(None).await;
    context.insert_new_team(Some(team.id)).await.unwrap();

    // Person with super condition property set to false in DB
    context
        .insert_person(
            team.id,
            "super_cond_user".to_string(),
            Some(json!({
                "$feature_enrollment/my-feature": false,
                "email": "user@example.com"
            })),
        )
        .await
        .unwrap();

    // Create a realtime cohort via Django, then manually build the flag
    // (super_groups aren't part of the flag serializer's standard flow)
    let cohort_result = context.create_cohort_via_django(
        team.id,
        "Example Users",
        json!({
            "properties": {
                "type": "OR",
                "values": [{
                    "type": "AND",
                    "values": [{
                        "key": "email",
                        "type": "person",
                        "value": "@example.com",
                        "operator": "icontains"
                    }]
                }]
            }
        }),
        false,
    )?;

    assert_eq!(
        cohort_result.cohort_type.as_deref(),
        Some("realtime"),
        "Cohort should be realtime"
    );

    // Build flag JSON with super_groups — this targets the realtime cohort
    let flag_json = json!([{
        "id": 1,
        "key": "super-cond-realtime-flag",
        "name": "Super Condition + Realtime Cohort",
        "active": true,
        "deleted": false,
        "team_id": team.id,
        "filters": {
            "groups": [{
                "variant": null,
                "properties": [{
                    "key": "id",
                    "type": "cohort",
                    "value": cohort_result.id
                }],
                "rollout_percentage": 100
            }],
            "payloads": {},
            "multivariate": null,
            "super_groups": [{
                "properties": [{
                    "key": "$feature_enrollment/my-feature",
                    "type": "person",
                    "value": ["true"],
                    "operator": "exact"
                }],
                "rollout_percentage": 100
            }]
        }
    }]);

    insert_flags_for_team_in_redis(client.clone(), team.id, Some(flag_json.to_string())).await?;

    let server = ServerHandle::for_config(config).await;

    // Without override: DB has enrollment=false → flag disabled via super condition
    let res = server
        .send_flags_request(
            json!({"token": token, "distinct_id": "super_cond_user"}).to_string(),
            Some("2"),
            None,
        )
        .await;
    assert_eq!(res.status(), StatusCode::OK);
    assert_json_include!(
        actual: res.json::<Value>().await?,
        expected: json!({
            "errorsWhileComputingFlags": false,
            "flags": {
                "super-cond-realtime-flag": {
                    "key": "super-cond-realtime-flag",
                    "enabled": false
                }
            }
        })
    );

    // With override: enrollment=true → flag enabled via super condition short-circuit
    // (doesn't even need to evaluate the cohort filter)
    let res = server
        .send_flags_request(
            json!({
                "token": token,
                "distinct_id": "super_cond_user",
                "person_properties": {
                    "$feature_enrollment/my-feature": true
                }
            })
            .to_string(),
            Some("2"),
            None,
        )
        .await;
    assert_eq!(res.status(), StatusCode::OK);
    assert_json_include!(
        actual: res.json::<Value>().await?,
        expected: json!({
            "errorsWhileComputingFlags": false,
            "flags": {
                "super-cond-realtime-flag": {
                    "key": "super-cond-realtime-flag",
                    "enabled": true,
                    "reason": {
                        "code": "super_condition_value"
                    }
                }
            }
        })
    );

    Ok(())
}

/// Static cohorts work differently — membership is stored in `posthog_cohortpeople`
/// rather than being computed at evaluation time. This test verifies that a static
/// cohort created via Django serializer (with `is_static: true`) is correctly
/// evaluated by the Rust `/flags` endpoint using the cohortpeople lookup path.
#[tokio::test]
async fn test_static_cohort_membership() -> Result<()> {
    let config = DEFAULT_TEST_CONFIG.clone();
    let client = setup_redis_client(Some(config.redis_url.clone())).await;
    let team = insert_new_team_in_redis(client.clone()).await.unwrap();
    let token = team.api_token.clone();

    let context = TestContext::new(None).await;
    context.insert_new_team(Some(team.id)).await.unwrap();

    // Create persons
    let member_id = context
        .insert_person(
            team.id,
            "static_member".to_string(),
            Some(json!({"email": "member@example.com"})),
        )
        .await
        .unwrap();

    context
        .insert_person(
            team.id,
            "non_member".to_string(),
            Some(json!({"email": "nonmember@example.com"})),
        )
        .await
        .unwrap();

    // Create static cohort via Django — note is_static: true
    // Static cohorts don't use filters for runtime evaluation; membership is explicit.
    let cohort_result = context.create_cohort_via_django(
        team.id,
        "Static VIP Users",
        json!({
            "properties": {
                "type": "OR",
                "values": []
            }
        }),
        true, // is_static = true
    )?;

    // Static cohorts should have cohort_type = None (they're not realtime)
    // Django may set it to "static" or leave it None depending on version
    assert!(cohort_result.is_static, "Cohort should be marked as static");

    // Add the member to the static cohort via the cohortpeople table
    context
        .add_person_to_cohort(cohort_result.id, member_id)
        .await
        .unwrap();

    // Create flag targeting the static cohort
    let flag_json = json!([{
        "id": 1,
        "key": "static-cohort-flag",
        "name": "Static Cohort Flag",
        "active": true,
        "deleted": false,
        "team_id": team.id,
        "filters": {
            "groups": [{
                "properties": [{
                    "key": "id",
                    "type": "cohort",
                    "value": cohort_result.id
                }],
                "rollout_percentage": 100
            }]
        }
    }]);

    insert_flags_for_team_in_redis(client.clone(), team.id, Some(flag_json.to_string())).await?;

    let server = ServerHandle::for_config(config).await;

    // Member of static cohort → enabled
    let res = server
        .send_flags_request(
            json!({"token": token, "distinct_id": "static_member"}).to_string(),
            Some("2"),
            None,
        )
        .await;
    assert_eq!(res.status(), StatusCode::OK);
    assert_json_include!(
        actual: res.json::<Value>().await?,
        expected: json!({
            "errorsWhileComputingFlags": false,
            "flags": {
                "static-cohort-flag": {
                    "key": "static-cohort-flag",
                    "enabled": true
                }
            }
        })
    );

    // Non-member of static cohort → disabled
    let res = server
        .send_flags_request(
            json!({"token": token, "distinct_id": "non_member"}).to_string(),
            Some("2"),
            None,
        )
        .await;
    assert_eq!(res.status(), StatusCode::OK);
    assert_json_include!(
        actual: res.json::<Value>().await?,
        expected: json!({
            "errorsWhileComputingFlags": false,
            "flags": {
                "static-cohort-flag": {
                    "key": "static-cohort-flag",
                    "enabled": false
                }
            }
        })
    );

    Ok(())
}
