use std::sync::Arc;

use crate::circuit_breaker_registry::CircuitBreakerRegistry;
use crate::config::Config;
use crate::routing::WorkloadRouter;
use crate::team_limits::TeamLimits;

/// Shared application state accessible from all handlers.
#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub router: Arc<WorkloadRouter>,
    pub circuit_breakers: Arc<CircuitBreakerRegistry>,
    pub team_limits: Arc<TeamLimits>,
    pub http_client: reqwest::Client,
}

impl AppState {
    pub fn new(config: Config) -> Self {
        let router = WorkloadRouter::from_config(&config);
        let circuit_breakers = CircuitBreakerRegistry::new(&config);
        let team_limits = TeamLimits::new(&config);
        let http_client = reqwest::Client::builder()
            .pool_max_idle_per_host(10)
            .timeout(std::time::Duration::from_secs(
                config.offline_max_execution_time as u64 + 5,
            ))
            .build()
            .expect("failed to build HTTP client");

        Self {
            config: Arc::new(config),
            router: Arc::new(router),
            circuit_breakers: Arc::new(circuit_breakers),
            team_limits: Arc::new(team_limits),
            http_client,
        }
    }
}
